# Email delivery operations

The business Worker owns dispatch authorization, the recipient route snapshot, and
the document. The private `auditsphere-email-provider` Worker enforces a second
recipient policy and sends the message. Email content and attachments must never
appear in logs.

## Providers and recipient policies

| Environment | Transport | Policy | Recipient scope |
|---|---|---|---|
| Default/local | No transport configured; sends fail closed | `ALLOWLIST` | No delivery |
| Staging | Cloudflare Email Service Worker binding | `ALLOWLIST` | Explicit approved test mailbox only |
| Production | Cloudflare Email Sending REST API | `ROUTED` | One valid recipient with a matching route ID and SHA-256 proof from the private business Worker |

Cloudflare's native Worker binding can send only to destination addresses verified
in the Cloudflare account. Routed production contacts therefore use the Email
Sending REST API. The sender domain must be onboarded to Email Sending. The
production API token must have the account-scoped `Email Sending: Edit` permission;
store it as the `EMAIL_API_KEY` Worker secret for the production provider. Never
put the token in Wrangler vars, source, logs, or a message. See Cloudflare's
[send-binding restrictions](https://developers.cloudflare.com/email-service/configuration/send-bindings/)
and [REST API](https://developers.cloudflare.com/email-service/api/send-emails/rest-api/).

Cloudflare Email Sending's **Email preview** setting is enabled by the owner's
choice (verified 2026-10-09). Cloudflare may show sent-message content in the
Email Sending activity view for about seven days. This is an accepted provider-
console privacy exception, not evidence that the strict no-content-in-logs
requirement has passed. Keep the application and Worker logs free of message
bodies and attachments; do not use this exception as approval to send client
content through the prototype.

Deploy the private production provider only after its API secret exists:

```sh
npx wrangler secret put EMAIL_API_KEY --config worker/emailProvider/wrangler.jsonc --env production
npx wrangler deploy --config worker/emailProvider/wrangler.jsonc --env production
```

For CI/CD, save a separate account-scoped Email Sending token as the
`CLOUDFLARE_EMAIL_SENDING_TOKEN` secret in the GitHub `cloudflare-production`
environment. Set the `CLOUDFLARE_EMAIL_SENDING_ENABLED` environment variable to
`true` only when production routed email is approved; the workflow then installs
the token as `EMAIL_API_KEY` and deploys the production provider. The Worker deploy
token and Email Sending token are separate credentials with separate scopes.

`worker/emailProvider/wrangler.jsonc` keeps `workers_dev` disabled in every
environment. The production config has no native binding and no `workers.dev`
route. `wrangler.jsonc` binds the business Worker to the production provider.

## Sender domain and DNS checklist

The configured sender is `audit-dispatch@mail.steaudit.com`; the sending domain is
`mail.steaudit.com`. In Cloudflare Email Service → Email Sending, confirm the
domain remains **Enabled / DNS Configured** and copy the exact records shown for
the account if Cloudflare requests repair:

| Record purpose | Source of truth | Verification |
|---|---|---|
| SPF TXT | Cloudflare's sending-domain DNS panel | Sender-domain status shows configured |
| DKIM TXT | Cloudflare's sending-domain DNS panel | Sender-domain status shows configured |
| DMARC TXT | Cloudflare's sending-domain DNS panel | Record is published at the displayed `_dmarc` name |
| Bounce MX/TXT | Cloudflare's sending-domain DNS panel, under its bounce subdomain | Bounce records point to Cloudflare |

Record names and values are generated per domain/account. Copy them from that
panel; do not substitute guessed values. Email Sending's bounce records are
separate from inbound Email Routing. Do not change the apex MX for this sender
setup: `steaudit.com` inbound mail currently uses Microsoft 365. Do not enable
Cloudflare Email Routing on the apex unless the firm explicitly migrates inbound
mail.

### Inbound alias forwarding

The `steaudit.com` domain is Healthy in the Microsoft 365 tenant whose default
domain is `gbskandy.onmicrosoft.com`. `audit@steaudit.com` is an alias on the
owner's M365 mailbox. On 2026-10-09, Exchange Admin Center enabled the rule
**AuditSphere route audit alias to Quadrate**: recipient address matches the
exact pattern `^audit@steaudit\.com$`, and Exchange adds the owner-selected
external mailbox to Bcc. This keeps the normal alias mailbox delivery and adds a copy only for that
alias. The domain MX remains on Microsoft 365; Cloudflare Email Routing is not
used for this path. Configuration is confirmed in Exchange, but end-to-end mail
receipt has not been tested. The rule does not prove outbound application email
delivery through the Cloudflare provider.

## Route proof and delivery statuses

For `ROUTED`, each provider request must contain exactly one syntactically valid
recipient, a contact-route UUID, and `recipientSha256` equal to SHA-256 of the
trimmed, lower-case recipient address. Role addresses such as `postmaster`,
`security`, `abuse`, and `no-reply` are rejected before transport. The provider is
private; only the authenticated business Worker may call it.

Cloudflare REST responses map recipient outcomes to dispatch states:

- `delivered` → `DELIVERED`
- `queued` → `ACCEPTED`
- `permanent_bounces` or `suppressed_recipients` → `BOUNCED`

Cloudflare REST status is immediate and recipient-specific. It does not use the
HTTP callback below. For an HTTP API provider that supports callbacks, configure
`EMAIL_STATUS_WEBHOOK_SECRET` on the business Worker and sign the exact raw JSON
body as follows:

```text
X-AuditSphere-Timestamp: <Unix seconds>
X-AuditSphere-Signature: sha256=<lowercase HMAC-SHA256 hex>
HMAC input: <timestamp>.<exact raw request body>
POST /api/webhooks/email-status
```

The timestamp must be within five minutes of receipt. JSON keys are exactly
`eventId`, `dispatchId`, `providerMessageId`, `status` (`DELIVERED` or `BOUNCED`),
and `occurredAt`. The callback is idempotent by provider event ID, accepts only
the matching provider message ID, and never downgrades a terminal dispatch state.
`dispatch_delivery_events` retains only dispatch/event identifiers, status, and
timestamps; it does not retain the request body or email address. Invalid
signatures return `401` without a database change.

## Staging send and UAT evidence

1. Verify the approved non-production destination in Cloudflare before sending.
2. Confirm staging still uses `ALLOWLIST` and the destination is the only allowed
   address.
3. Use a synthetic, non-client EL from the staging workspace and initiate the
   normal authenticated dispatch flow.
4. Confirm the mailbox received the message and that the dispatch has a provider
   message ID and status in the staff-visible engagement history.
5. Record date, dispatch ID, provider message ID, recipient approval reference,
   and observed status in `docs/ops/uat-log.md`. Never attach message contents or
   credentials to the log.

No successful staging delivery is recorded by this run. The last recorded account
check had the approved UAT destination `testing@mail.steauditing.com` in **Pending**
state. Repeat the verification check before sending; do not treat a dashboard
provider binding or an `ACCEPTED` state as proof that the mailbox received mail.
The pending live-send acceptance is tracked in `docs/ops/uat-log.md`.

## Rotate the Email Sending API token

1. Create a replacement Cloudflare API token scoped to the account with
   `Email Sending: Edit` only.
2. Update the production `EMAIL_API_KEY` Worker secret using the command above.
3. Send and verify one approved staging message and inspect the production
   provider health through the private service binding.
4. Revoke the old token in Cloudflare and record only the rotation date and owner.

Never paste a token into chat, issue text, logs, or this document.
