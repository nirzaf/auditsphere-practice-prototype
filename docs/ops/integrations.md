# Integration configuration (email, SharePoint/Graph, UAT environment)

This runbook covers the three items the completion backlog recorded as externally
blocked. It records the integration code and configuration in the repository and
the account-owner steps that still gate live acceptance. Integration status must
come from the deployed Worker; local configuration is not evidence of connectivity.

The latest verified production Worker is main commit
`446f27583bc261d3a66cc580b98713d0357edf83`, deployed by [GitHub Actions run
37781910365](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/37781910365)
on 2026-10-08 at 13:12 UTC. CI passed application/Worker typecheck, unit tests,
browser E2E, and production build. The deployment job applied and verified
R2 archive-retention locks, deployed the restricted Email Service provider,
applied approved D1 migrations, deployed the Worker/static assets, and passed
the Worker readiness probe. This proves deployment health, not outbound email
delivery or SharePoint authentication. The main Worker deploys from checked-in
`wrangler.jsonc`; the earlier strict-mode config conflict is resolved.

A `GET /api/integrations/status` observed at 2026-10-08 12:39:59 UTC reported
email `configured: true` with transport `SERVICE_BINDING` and
`providerReadiness: READY`; SharePoint reports `FAILED` because Microsoft Graph
rejected the token request. A healthy deployment does not by itself establish
email delivery or SharePoint connectivity; the integration probe remains failed
for SharePoint and pending for real email delivery.

Verify the current state of every integration at any time:

```sh
curl -s https://<worker-url>/api/integrations/status
# {
#   "email": {
#     "configured": true,
#     "transport": "SERVICE_BINDING",
#     "providerReadiness": "READY"
#   },
#   "sharepoint": { "state": "FAILED", "siteHostname": "easyguide.sharepoint.com", ... }
# }
```

For a service-bound email provider, `configured` is true only when the provider's
`/health` probe confirms an active transport, a syntactically valid `EMAIL_FROM`
address, and a valid `EMAIL_ALLOWED_RECIPIENTS` list. An unreachable provider,
absent transport, missing/placeholder sender, or missing recipient policy reports
`configured: false` and `providerReadiness: "UNAVAILABLE"`. The probe does not verify the sender domain,
destination allowlist, recipient verification, or successful delivery; those
still require Cloudflare account evidence and a controlled test send. A send
request rejected with HTTP 424 means the provider did not attempt delivery
(transport or sender configuration is unavailable); the outbox records a
definite failure that can be retried after the configuration is corrected. A
transport error after the provider call begins remains an unknown outcome and
requires reconciliation before retry.

## 1. Email delivery (US-GAP-05 / US-GAP-06)

The business Worker dispatches proposal and commercial documents through the
`EMAIL_PROVIDER` service binding (`worker/businessOutbox.ts`), which expects a
`POST /send` multipart request and a `{ messageId, status }` reply. Provider
policies are environment-specific:

- Local uses no transport and fails closed. Staging uses Cloudflare's restricted
  `send_email` binding with `ALLOWLIST`; only the explicitly approved UAT recipient is allowed.
- Production uses Cloudflare Email Sending REST with `ROUTED`; each request needs
  a contact-route ID and SHA-256 proof of its normalized recipient address. The
  provider is private (`workers_dev:false`) and the business Worker is its only caller.

Cloudflare's native binding can send only to destinations verified in the account.
The REST API supports routed recipients from an onboarded sender domain and returns
recipient-specific `delivered`, `queued`, and `permanent_bounces` statuses. The
production provider needs an account-scoped token with `Email Sending: Edit`, stored
as the Worker secret `EMAIL_API_KEY`. DNS, HMAC callback, and rotation steps are in
[`email.md`](email.md).

`mail.steaudit.com` was last observed as **Enabled / DNS Configured** for Email
Sending. The approved UAT destination `testing@mail.steauditing.com` was last
observed as **Pending**. No successful application send is recorded; recheck the
destination and complete a controlled staging delivery before claiming the live
email acceptance criterion.

Cloudflare Email Routing is inbound forwarding and separate from outbound Email
Sending. The requested inbound alias `audit@steaudit.com` → `fazrin@quadrate.lk`
is not active until a routing rule is created and tested. Do not enable Email
Routing on the root zone while its apex MX points to Microsoft 365; the onboarding
preview proposes replacing that MX and could interrupt existing `@steaudit.com`
mail. Keep the current inbound provider while configuring outbound sender records.

## 2. SharePoint / Microsoft Graph (US-GAP-25 – US-GAP-28)

The adapter (`worker/integrations/sharepoint.ts`) resolves the configured site to
stable site/drive/root identifiers, creates canonical folders, uploads file bytes,
lists versions and reads retention state. It needs a Microsoft Entra app
registration with application permission to the designated site.

Required external inputs (firm-owned):
- `SHAREPOINT_TENANT_ID` — Microsoft Entra tenant id.
- `SHAREPOINT_CLIENT_ID` — app registration (client) id.
- `SHAREPOINT_CLIENT_SECRET` — client secret; enter it directly into Cloudflare's
  Worker secret UI or an authorized secret-management flow. Never commit it.
- `SHAREPOINT_SITE_HOSTNAME` — e.g. `contoso.sharepoint.com`.
- `SHAREPOINT_SITE_PATH` — e.g. `/sites/audit-test` (the **existing** test site).
- `SHAREPOINT_DRIVE_NAME` — the document library (default `Documents`).

The `AuditSphere SharePoint UAT` app is registered and has tenant-consented Graph
application permission `Sites.Selected`. On 2026-10-08, the site owner-authorized
Graph request created the site-specific grant. A follow-up `GET` on the site's
permissions returned the target app with `roles: ["write"]` for
`https://easyguide.sharepoint.com/sites/AuditSphereJSAcceptance`. The Worker config
already contains the non-secret tenant, app, site hostname/path, and `Documents`
library values. A fresh live `GET /api/integrations/status` on 2026-10-08 at
01:02:32 UTC returned `sharepoint.state: FAILED` with the message that Microsoft
Graph rejected the token request. The Worker is therefore not connected. A client
secret is configured but is not currently authenticating successfully.
The app remains limited to `Sites.Selected`; do not give it tenant-wide
`Sites.ReadWrite.All` or `Sites.FullControl.All`.

The configured SharePoint client secret was exposed in browser accessibility
output during the setup session. Treat it as compromised. The app currently lists
one replacement secret labeled `AuditSphere UAT Cloudflare Worker rotated
(180-day)`, expiring 2027-04-06. Microsoft shows secret values only at creation;
the live Worker still receives a rejected Graph token response, so the deployed
secret has not been proven to match. If the owner no longer has that replacement
value, create another and enter it directly as `SHAREPOINT_CLIENT_SECRET` in the
Cloudflare Worker secret UI. Never copy it into this runbook, chat, or repository.
Repeat the live status probe and a real site read/write check after the Cloudflare
secret is updated; a successful token request alone does not prove the site grant works.

The deployed Worker token cache keys entries by a non-reversible SHA-256 fingerprint of
the client secret, tenant and app identity. A same-length secret rotation now
invalidates the cached token; regression coverage is in
`tests/unit/sharePointAdapter.test.ts`. The current `FAILED` probe at
2026-10-08 12:02:37 UTC is still using a rejected credential; matching the
deployed credential and a site read/write check are still required.

The SharePoint Admin Center session reviewed on 2026-10-07 can see the approved
acceptance site and its site settings/membership, but does not expose a Graph
`Sites.Selected` app-permission grant action. The site grant was subsequently
applied and verified through Microsoft Graph.

Example with an already-approved PnP grant-authority app and an authorized admin
session (this grants only the target site and `Write` role):

```powershell
Connect-PnPOnline `
  -Url "https://easyguide.sharepoint.com/sites/AuditSphereJSAcceptance" `
  -Interactive `
  -ClientId "<approved grant-authority app id>"

Grant-PnPEntraIDAppSitePermission `
  -AppId "69eddc6b-194f-411a-9d77-5b96fa1602ad" `
  -DisplayName "AuditSphere SharePoint UAT" `
  -Permissions Write `
  -Site "https://easyguide.sharepoint.com/sites/AuditSphereJSAcceptance"
```

Verify the resulting permission with `Get-PnPEntraIDAppSitePermission` for the
same site and app. The site-only `write` grant has already been read back from
Microsoft Graph; do not broaden the app's permission scope.

```sh
# configure the SHAREPOINT_* non-secret vars in wrangler.jsonc
# after the site grant, enter SHAREPOINT_CLIENT_SECRET directly as a Worker secret
# in Cloudflare; never paste it into chat or commit it
npm run cloud:deploy
curl -s https://<worker-url>/api/integrations/status   # sharepoint.state should become CONNECTED
```

The firm-approved site path and replacement client secret remain owner-managed;
tenant consent for `Sites.Selected` and the site-specific `write` grant are already
verified. Keep all site-specific access on the acceptance site only.

## 3. UAT environment and persona journeys (US-GAP-30 – US-GAP-32)

The behavioural journeys run against the deployed build using synthetic STAFF
and CLIENT accounts, with each browser session restricted to profiles granted to
that account. Staff sign in through the configured Microsoft Entra OIDC client;
clients use credentials provisioned through the firm-admin workflow. Do not use
real client evidence or share credentials in the manifest. Populate the
non-secret manifest below before acceptance:

| Field | Source |
| --- | --- |
| Application URL | https://auditsphere-visual-prototype.quadrate-lk.workers.dev (readiness returns `ready`) |
| Deployed build identity | `446f27583bc261d3a66cc580b98713d0357edf83` (verified Worker deployment, 2026-10-08; GitHub Actions run 37781910365) |
| Workspace and actors | **Blocked.** A synthetic UAT workspace and granted STAFF/CLIENT test accounts must be provisioned through the authenticated firm-admin/bootstrap workflow before acceptance. Do not enable unauthenticated public workspace setup. |
| Client / engagement ids | **Not created.** There are no deployed UAT records or IDs to record until the trusted test workspace flow is enabled and verified. |
| SharePoint site/library/root ids | values returned by `/api/integrations/status` after the site grant and secret are configured |
| Email provider | `SERVICE_BINDING` is configured; recipient verification and a controlled UAT delivery are still unverified |

Do not store passwords, tokens, real client evidence or session cookies in this
file. Use synthetic data and a trusted test environment; actor identity and
available profile grants are derived from the authenticated session.
