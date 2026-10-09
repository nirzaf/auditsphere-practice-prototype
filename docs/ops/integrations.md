# Integration configuration (email, SharePoint/Graph, UAT environment)

This runbook covers the three items the completion backlog recorded as externally
blocked. It records the integration code and configuration in the repository and
the account-owner steps that still gate live acceptance. Integration status must
come from the deployed Worker; local configuration is not evidence of connectivity.

Main commit `4ff0fe0ef375efc9c35e5960b0287ef3f6ad5469` was deployed by
[GitHub Actions run 37912091736](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/37912091736)
on 2026-10-09 at 12:37 UTC. The verification job passed. The deployment job
applied R2 archive-retention locks, deployed the Email Service provider, applied
the approved D1 migrations (including `0045`), and deployed the Worker/static
assets. Its final readiness probe returned HTTP 503, so this is a completed
deployment but **not a ready release**. The observed readiness blockers are
missing Worker secrets `TURNSTILE_SECRET_KEY` and `PUBLIC_LEAD_IP_HASH_SECRET`,
plus the SharePoint app's rejected client-credential request. The main Worker
deploys from checked-in `wrangler.jsonc`; the earlier strict-mode config conflict
is resolved.

The deployed Worker's last observed `/api/integrations/status` reported email
`configured: true` with transport `SERVICE_BINDING` and
`providerReadiness: READY`; SharePoint reports `FAILED` because Microsoft Graph
rejected the token request. The 2026-10-09 readiness probe returned HTTP 503
with `TURNSTILE_NOT_CONFIGURED` and
`PUBLIC_LEAD_IP_HASH_SECRET_NOT_CONFIGURED`. A healthy provider probe does not
prove a successful message delivery, and the SharePoint site read/write check is
still outstanding.

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
observed as **Pending**. A user-provided Cloudflare confirmation screen shows
`fazrin@quadrate.lk` is verified as an Email Routing destination; this does not
verify the separate outbound Email Sending recipient or prove delivery. No
successful application send is recorded; recheck the outbound destination and
complete a controlled staging delivery before claiming the live email acceptance
criterion.

Cloudflare Email Routing is inbound forwarding and separate from outbound Email
Sending. The requested inbound alias `audit@steaudit.com` → `fazrin@quadrate.lk`
is not active until a routing rule is created and tested. The current Cloudflare
DNS records show the `steaudit.com` apex MX points to Microsoft 365
(`steaudit-com.mail.protection.outlook.com`). Cloudflare Email Routing on the
apex requires changing MX delivery for the domain and could interrupt all
existing `@steaudit.com` mail. On 2026-10-09 the owner chose to preserve the
Microsoft 365 MX, so this apex route remains inactive. Revisit only with a
planned inbound-mail migration or a separately approved subdomain route.

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
output during the setup session. Treat it as compromised. Azure currently lists
one replacement secret labeled `AuditSphere UAT Cloudflare Worker rotated
(180-day)`, expiring 2027-04-06. Its validity period does not establish that the
Cloudflare Worker contains the matching value: Graph still rejects the deployed
credential. If the replacement value is no longer available, create another and
enter it directly as `SHAREPOINT_CLIENT_SECRET` in Cloudflare Worker settings.
Never copy it into this runbook, chat, or repository. Repeat the live status probe
and a real site read/write check after the Worker secret is updated; a successful
token request alone does not prove the site grant works.

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

The behavioural journeys run against the deployed build using the epic's explicit
no-auth profile: a synthetic workspace with the four self-selected personas
PREPARER, REVIEWER, APPROVER and CLIENT. Do not request or create login accounts,
passwords, OAuth sessions or identity claims for these journeys. Persona selection
is a workflow context, not verified identity. Populate the non-secret manifest
below before acceptance:

| Field | Source |
| --- | --- |
| Application URL | https://auditsphere-visual-prototype.quadrate-lk.workers.dev (2026-10-09 readiness returned HTTP 503; not ready) |
| Deployed build identity | `4ff0fe0ef375efc9c35e5960b0287ef3f6ad5469` (Worker/assets deployment completed, 2026-10-09; GitHub Actions run 37912091736; readiness failed) |
| Workspace and actors | **Blocked.** The deployed public `workers.dev` Worker returned `Business workspace setup is not enabled for this trusted deployment.` when the synthetic create flow was submitted. No workspace or actors were created. Keep the setup gate disabled on this unrestricted, no-auth endpoint; establish a trusted test perimeter and explicitly enable bootstrap there before recording UAT evidence. |
| Client / engagement ids | **Not created.** There are no deployed UAT records or IDs to record until the trusted test workspace flow is enabled and verified. |
| SharePoint site/library/root ids | values returned by `/api/integrations/status` after the deployed client secret authenticates and the granted site is reachable |
| Email provider | `SERVICE_BINDING` reports `READY`; approved outbound recipient status and a controlled UAT delivery are still unverified |

Do not store passwords, tokens, real client evidence or actor identity assertions
in this file. The no-auth deployment boundary remains: use synthetic data and a
trusted test environment; persona selection is not authentication.
