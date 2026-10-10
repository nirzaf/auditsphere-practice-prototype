# Worker environments

`wrangler.jsonc` defines a local-only development environment plus isolated
`staging` and `production` app Workers. The `dev` and `preview` npm scripts use
the local D1/R2 bindings and do not connect to remote resources. Local mode
omits the Email Provider binding. The old
`auditsphere-visual-prototype` Worker, database, and bucket remain online and
untouched until the owner approves a cutover and later decommissioning.

**Trust boundary:** this project follows the no-application-auth profile in the
AuditSphere real-implementation epic. The selected actor/persona/context is
caller supplied and is not identity verification or authorization. Both named
Workers set `workers_dev: false`; their routes remain unset until D6 selects an
approved hostname and the trusted perimeter is configured. Do not enable a
public `workers.dev` endpoint or use it for confidential client information.
Do not add OAuth, passwords, sessions, or RBAC as an implicit workaround.

## Isolated Cloudflare resources

| Environment | Worker | D1 | R2 | Email provider | GitHub environment |
| --- | --- | --- | --- | --- | --- |
| Staging | `auditsphere-staging` | `auditsphere-staging` | `auditsphere-staging-files` | `auditsphere-email-provider-staging` | `cloudflare-staging` |
| Production | `auditsphere` | `auditsphere-production` | `auditsphere-production-files` | `auditsphere-email-provider` | `cloudflare-production` |

The checked-in D1 IDs are `REPLACE_WITH_…` placeholders. Do not enable
`AUDITSPHERE_STAGING_DEPLOY_ENABLED` or run deployment/migration commands until
the firm has completed D5, the isolated resources exist, IDs are entered in the
config, Worker secrets are installed, and a trusted route is protected with
Cloudflare Access. D1 and R2 jurisdiction settings cannot be changed after
resource creation. Cloudflare currently offers no Qatar/GCC data-residency
jurisdiction; an `apac` location hint is best-effort and does not promise
Qatar/GCC storage. Have the firm/legal adviser record the accepted location and
cross-border processing decision first.

After D5 approval, create each resource once. Use exactly one approved
jurisdiction or location policy for all four data resources; do not combine the
examples without the owner/legal decision. The flags below are supported by the
installed Wrangler 4.147 CLI:

```powershell
# Example only if the owner/legal adviser explicitly approves EU residency:
npx wrangler d1 create auditsphere-staging --jurisdiction eu
npx wrangler r2 bucket create auditsphere-staging-files --jurisdiction eu
npx wrangler d1 create auditsphere-production --jurisdiction eu
npx wrangler r2 bucket create auditsphere-production-files --jurisdiction eu

# If there is no residency requirement and the owner accepts a performance hint,
# use --location apac instead of --jurisdiction; location hints are not guarantees:
npx wrangler d1 create auditsphere-staging --location apac
npx wrangler r2 bucket create auditsphere-staging-files --location apac
npx wrangler d1 create auditsphere-production --location apac
npx wrangler r2 bucket create auditsphere-production-files --location apac
```

Copy the two D1 UUIDs into the corresponding `database_id` fields in
`wrangler.jsonc`. The selected R2 jurisdiction must also be added to each
`r2_buckets[].jurisdiction` binding. For a non-jurisdictional bucket, omit that
property. If an approved location differs from the examples, substitute the
matching current Wrangler flag and option. Never create production resources
before staging is separately isolated and its boundary is approved.

Configure GitHub environment `cloudflare-staging` with:

- Secrets: `CLOUDFLARE_API_TOKEN`, `CLOUDFLARE_ACCOUNT_ID`,
  `CLOUDFLARE_R2_LOCKS_TOKEN`, `CF_ACCESS_CLIENT_ID`, and
  `CF_ACCESS_CLIENT_SECRET`.
- Variables: `AUDITSPHERE_STAGING_DEPLOY_ENABLED=true` only after the checklist
  above is satisfied, and `AUDITSPHERE_READINESS_URL` set to the protected
  staging `/api/health/ready` endpoint.

Configure `cloudflare-production` with the corresponding deploy/account/R2
secrets and Access service-token secrets, plus `AUDITSPHERE_READINESS_URL`.
Production remains an explicit `workflow_dispatch` with
`confirm_production_deploy=true` and GitHub environment approval; main pushes
never deploy production. `CLOUDFLARE_EMAIL_SENDING_TOKEN` is required only when
`CLOUDFLARE_EMAIL_SENDING_ENABLED=true`.

Install the following encrypted Worker secrets separately in each applicable
environment; never place their values in Wrangler vars:

- `PUBLIC_LEAD_IP_HASH_SECRET` (32+ random characters) in staging and
  production.
- `TURNSTILE_SECRET_KEY` in production; in staging only if a staging intake
  hostname is explicitly approved and configured.
- `SHAREPOINT_CLIENT_SECRET` only in staging if the approved UAT site
  integration is enabled. Production SharePoint remains unconfigured until a
  separate site and access grant are approved.
- `OIDC_CLIENT_SECRET` is not used in the current no-application-auth product
  scope. Do not create it unless the product owner explicitly changes that
  scope.

The custom-domain `routes` are intentionally absent from production until D6
selects the AuditSphere hostname. Add the approved route to the environment and
Cloudflare Access policy before enabling either deployment. Do not remove the
legacy Worker/D1/R2 resources as part of this change; retire them only after
go-live traffic and retention have been reviewed by the owner.

## Rate limits

Cloudflare Worker Rate Limiting bindings accept 10-second or 60-second periods. The application uses hashed identifiers so raw IP addresses and email addresses are not sent as rate-limit keys.

| Binding | Limit | Keys used |
| --- | ---: | --- |
| `RATE_LIMITER` | 1,000 per minute | Existing route and workspace command buckets; bucket key semantics are unchanged. |
| Durable D1 public-lead window | 5 per hour | HMAC digest of client IP; raw IP is not stored. |

Each environment has a distinct numeric `namespace_id` for the general Cloudflare binding. The public lead endpoint also enforces its required five-per-hour limit with a durable D1 sliding window because Cloudflare rate limiting is location scoped.

Production readiness requires the general rate-limit binding; local development can run without it to keep tests and offline development practical. There are no application login or password-reset routes in the current product scope.

## Public website inquiries

The public intake endpoint uses Cloudflare Turnstile plus the D1 rolling hourly limiter. Set the Turnstile secret and a separate random `PUBLIC_LEAD_IP_HASH_SECRET` with at least 32 characters as Worker secrets. Set `PUBLIC_LEAD_DEFAULT_COUNTRY_CODE` to the firm's two-letter jurisdiction. The Worker stores only an HMAC-SHA-256 IP digest and applies a five-per-hour limit per digest; it does not retain a raw IP address.

Cross-origin web forms need `PUBLIC_LEAD_ALLOWED_ORIGINS` configured with exact origins. Leave it empty for same-origin-only posts. Set `PUBLIC_LEAD_TURNSTILE_HOSTNAMES` to the exact hostname list that Siteverify may return; a successful challenge from any other hostname is rejected. If more than one active BUSINESS workspace exists, set `PUBLIC_LEAD_WORKSPACE_ID` to the intended intake workspace. `PUBLIC_LEAD_NOTIFICATION_EMAIL` is optional and queues an email outbox job only when set; the existing `EMAIL_PROVIDER` must be configured to deliver to that destination. The notification is skipped for honeypot submissions. Production and staging readiness fail if the IP hashing key or default country is missing; production also requires the Turnstile secret and expected hostname list.

The AuditSphere inquiry integration uses `https://www.steaudit.com` as its allowed origin and `www.steaudit.com` as its expected Turnstile hostname. Staff notifications go to the M365 mailbox `audit@steaudit.com`. Keep the apex MX pointed at Microsoft 365 so all existing `@steaudit.com` inbound mail continues through the tenant; Cloudflare bounce MX records on their dedicated subdomain do not replace it.

See [web-form integration instructions](web-form.md) for an embeddable HTML example and operations checklist.

## Other deployment prerequisites

Keep environment-specific credentials in Worker secrets and GitHub environment secrets. Do not place API tokens, SharePoint client secrets, or email provider keys in `wrangler.jsonc` or this document. See [integrations](integrations.md) for provider-specific setup.

### GitHub Cloudflare token scopes

Both `cloudflare-staging` and `cloudflare-production` use
`CLOUDFLARE_API_TOKEN` for D1 migrations and Worker deployment. Each GitHub
environment needs a separate `CLOUDFLARE_R2_LOCKS_TOKEN`; it must not reuse
the general deployment token or the other environment's credential.
Cloudflare documents `Workers R2 Storage Write` as the permission needed to edit
bucket configuration. This permission is account-level and also grants bucket
creation/deletion/listing plus object read/write/list access across the account;
Cloudflare does not offer a bucket-scoped permission for lock configuration.
Create and save this token only after approving that CI access scope. Do not
grant the general deployment token the R2 permission. See Cloudflare's
[R2 token permission reference](https://developers.cloudflare.com/r2/api/tokens/)
and [bucket lock guide](https://developers.cloudflare.com/r2/buckets/bucket-locks/).
