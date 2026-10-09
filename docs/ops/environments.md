# Worker environments

The root `wrangler.jsonc` is the production Worker configuration. There is no named staging app Worker in this config. The `dev` and `preview` npm scripts override only `ENVIRONMENT` to `local`, while keeping the production binding names and limits so the same code paths stay usable locally.

**Trust boundary:** this project follows the no-application-auth profile in the AuditSphere real-implementation epic. The selected actor/persona/context is caller supplied and is not identity verification or authorization. `workers_dev: true` makes the Worker publicly reachable; never use that endpoint for confidential client information. A trusted network perimeter is a separate go-live prerequisite. Do not add OAuth, passwords, sessions, or RBAC as an implicit workaround.

## Rate limits

Cloudflare Worker Rate Limiting bindings accept 10-second or 60-second periods. The application uses hashed identifiers so raw IP addresses and email addresses are not sent as rate-limit keys.

| Binding | Limit | Keys used |
| --- | ---: | --- |
| `RATE_LIMITER` | 1,000 per minute | Existing route and workspace command buckets; bucket key semantics are unchanged. |
| Durable D1 public-lead window | 5 per hour | HMAC digest of client IP; raw IP is not stored. |

The numeric `namespace_id` in `wrangler.jsonc` is an account-scoped identifier for the general Cloudflare binding. The public lead endpoint also enforces its required five-per-hour limit with a durable D1 sliding window because Cloudflare rate limiting is location scoped.

Production readiness requires the general rate-limit binding; local development can run without it to keep tests and offline development practical. There are no application login or password-reset routes in the current product scope.

## Public website inquiries

The public intake endpoint uses Cloudflare Turnstile plus the D1 rolling hourly limiter. Set the Turnstile secret and a separate random `PUBLIC_LEAD_IP_HASH_SECRET` with at least 32 characters as Worker secrets. Set `PUBLIC_LEAD_DEFAULT_COUNTRY_CODE` to the firm's two-letter jurisdiction. The Worker stores only an HMAC-SHA-256 IP digest and applies a five-per-hour limit per digest; it does not retain a raw IP address.

Cross-origin web forms need `PUBLIC_LEAD_ALLOWED_ORIGINS` configured with exact origins. Leave it empty for same-origin-only posts. Set `PUBLIC_LEAD_TURNSTILE_HOSTNAMES` to the exact hostname list that Siteverify may return; a successful challenge from any other hostname is rejected. If more than one active BUSINESS workspace exists, set `PUBLIC_LEAD_WORKSPACE_ID` to the intended intake workspace. `PUBLIC_LEAD_NOTIFICATION_EMAIL` is optional and queues an email outbox job only when set; the existing `EMAIL_PROVIDER` must be configured to deliver to that destination. The notification is skipped for honeypot submissions. Production and staging readiness fail if the IP hashing key or default country is missing; production also requires the Turnstile secret and expected hostname list.

The AuditSphere inquiry integration uses `https://www.steaudit.com` as its allowed origin and `www.steaudit.com` as its expected Turnstile hostname. Staff notifications go to the M365 mailbox `audit@steaudit.com`. Keep the apex MX pointed at Microsoft 365 so all existing `@steaudit.com` inbound mail continues through the tenant; Cloudflare bounce MX records on their dedicated subdomain do not replace it.

See [web-form integration instructions](web-form.md) for an embeddable HTML example and operations checklist.

## Other deployment prerequisites

Keep environment-specific credentials in Worker secrets and GitHub environment secrets. Do not place API tokens, SharePoint client secrets, or email provider keys in `wrangler.jsonc` or this document. See [integrations](integrations.md) for provider-specific setup.
