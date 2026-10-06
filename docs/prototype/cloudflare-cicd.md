# Cloudflare CI/CD

The `CI` workflow verifies the app and Worker before the deployment job can
run. A successful push to `main` deploys the exact verified commit to the
existing Wrangler target: the Worker API, Vite Static Assets, D1/R2 bindings,
and configured cron trigger. Production deployment is disabled until the
repository variable `CLOUDFLARE_DEPLOY_ENABLED` is set to `true`.

## GitHub setup

1. Create the GitHub Actions environment `cloudflare-production` and restrict
   it to the `main` branch. Add the team's required production reviewer(s)
   before enabling deployment.
2. Add environment secrets `CLOUDFLARE_ACCOUNT_ID` and
   `CLOUDFLARE_API_TOKEN` to that environment.
3. Create the repository Actions variable `CLOUDFLARE_DEPLOY_ENABLED` with the
   value `true` after the environment and secrets are ready.

Create an account API token scoped to the account containing the existing
Worker. Grant the minimum Workers Editor access needed to deploy this Worker;
grant Workers Routes Write only if the deployment will add or change a zone
route or custom domain. Do not put the token in source control or print it in
workflow logs.

After activation, verified pushes to `main` deploy automatically. A maintainer
can also run the workflow manually on `main` and select
`confirm_production_deploy`; it still runs the complete verification job first.
The job uses Wrangler strict mode, serializes production deployments, and does
not run D1 migrations. Database migrations remain a separately reviewed step.

If the enable variable is unset or false, the deploy job is skipped. If it is
enabled before the environment secrets are configured, the deploy job fails
with the missing secret name and does not invoke Wrangler.
