# Integration configuration (email, SharePoint/Graph, UAT environment)

This runbook covers the three items the completion backlog recorded as externally
blocked. It records the integration code and configuration in the repository and
the account-owner steps that still gate live acceptance. Integration status must
come from the deployed Worker; local configuration is not evidence of connectivity.

The last verified production Worker is main commit
`b010b9c7dc63410b56919d66cef17839335b542f`, deployed by [GitHub Actions run
37765095335](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/37765095335)
on 2026-10-08. CI passed application/Worker typecheck, unit tests, browser E2E,
and production build. The deployment job applied and verified R2 archive-retention
locks, deployed the restricted Email Service provider, applied approved D1
migrations, deployed the Worker/static assets, and passed the Worker readiness
probe. This proves deployment health, not outbound email delivery or SharePoint
authentication. The main Worker deploys from checked-in `wrangler.jsonc`; the
earlier strict-mode config conflict is resolved.

A `GET /api/integrations/status` observed at 2026-10-08 10:47:32 UTC reported
email `configured: true` with transport `SERVICE_BINDING`; SharePoint reports
`FAILED` because Microsoft Graph rejected the token request. The latest readiness
probe returned `ready` at schema version 44 with no dependency codes. A healthy deployment does
not by itself establish email delivery or SharePoint connectivity; the integration
probe remains failed for SharePoint and pending for real email delivery.

Verify the current state of every integration at any time:

```sh
curl -s https://<worker-url>/api/integrations/status
# {
#   "email": { "configured": true, "transport": "SERVICE_BINDING" },
#   "sharepoint": { "state": "FAILED", "siteHostname": "easyguide.sharepoint.com", ... }
# }
```

## 1. Email delivery (US-GAP-05 / US-GAP-06)

The business Worker dispatches proposal and commercial documents through the
`EMAIL_PROVIDER` service binding (`worker/businessOutbox.ts`), which expects a
`POST /send` multipart request and a `{ messageId }` reply. Two supported options:

### Option A — standalone provider Worker + Cloudflare Email Service

```sh
# 1. Cloudflare Email Sending is enabled and DNS configured for mail.steaudit.com.
# 2. The provider binding is restricted to audit-dispatch@mail.steaudit.com and
#    testing@mail.steauditing.com. Verify that destination from its mailbox before
#    attempting a send; Cloudflare currently lists it as Pending.
# 3. CI deploys this provider before the business Worker service binding. The
#    cloudflare-production token must include Workers deployment and Email Sending: Edit.
npm run cloud:deploy
```

### Option B — standalone provider Worker + transactional email API

```sh
wrangler secret put EMAIL_API_KEY --config worker/emailProvider/wrangler.jsonc
# remove the send_email binding and set EMAIL_API_URL / EMAIL_FROM / EMAIL_FROM_NAME
# vars in the same config, then
wrangler deploy --config worker/emailProvider/wrangler.jsonc
# deploy the business Worker with its EMAIL_PROVIDER service binding.
```

Required external inputs (firm-owned):
- A verified sender domain/address the firm is authorised to send from.
- A verified Cloudflare Email Service destination address, or an API key for a transactional email provider.
- Approved **test recipients** (no real client recipients during UAT).

Cloudflare Email Routing handles inbound forwarding; it is not the outbound
transactional sender. The Email Service binding restricts both sender and recipient.
The provider Worker has `workers_dev` disabled and is reachable only through the
business Worker service binding.

Current account state: `mail.steaudit.com` is Enabled with DNS Configured. The
approved UAT recipient `testing@mail.steauditing.com` was last observed as
`Pending`; its verification was resent. The mailbox owner must open the message
and follow its verification link. The live Worker status confirms its provider
binding, not recipient verification or delivery. Do not claim a successful
application send until Cloudflare shows the recipient Verified and a controlled
UAT delivery succeeds.

The requested inbound alias is `audit@steaudit.com` → `fazrin@quadrate.lk`; the
destination is verified. On 2026-10-07, the Cloudflare dashboard showed
`fazrin@quadrate.lk` as **Verified** and the approved UAT test destination
`testing@mail.steauditing.com` as **Pending**. The `mail.steaudit.com` Email Sending
domain showed **Enabled / Configured** with zero sends in the dashboard's last-7-day
view. This confirms sender-domain setup only; it does not confirm a provider send or
live application delivery.

Do not enable Cloudflare Email Routing for the root zone while its apex MX points
to Microsoft 365: the onboarding preview proposes replacing that MX with three
Cloudflare MX records and adding a root SPF record, which can interrupt all
`@steaudit.com` inbound mail and change sender authorization. The DNS records page
confirmed the apex MX target is `steaudit-com.mail.protection.outlook.com`. Keep the
current MX and configure the alias through Microsoft 365, or obtain explicit
approval for a full mail migration before switching the root MX to Cloudflare.
The alias is not active until a routing rule has been created and tested.

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
output during the setup session. Treat it as compromised: the tenant owner must
revoke it, create a replacement, update the Cloudflare Worker secret, and redeploy.
Do not copy either secret into this runbook, chat, or repository. Repeat the live
status probe and a real site read/write check only after rotation; a successful
token request alone does not prove the site grant works.

The deployed Worker token cache keys entries by a non-reversible SHA-256 fingerprint of
the client secret, tenant and app identity. A same-length secret rotation now
invalidates the cached token; regression coverage is in
`tests/unit/sharePointAdapter.test.ts`. The current `FAILED` probe is still using
the existing rejected credential; owner rotation and a site read/write check are
still required.

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
| Application URL | https://auditsphere-visual-prototype.quadrate-lk.workers.dev (readiness returns `ready`) |
| Deployed build identity | `b010b9c7dc63410b56919d66cef17839335b542f` (verified Worker deployment, 2026-10-08; GitHub Actions run 37765095335) |
| Workspace and actors | **Blocked.** The deployed public `workers.dev` Worker returned `Business workspace setup is not enabled for this trusted deployment.` when the synthetic create flow was submitted. No workspace or actors were created. Keep the setup gate disabled on this unrestricted, no-auth endpoint; establish a trusted test perimeter and explicitly enable bootstrap there before recording UAT evidence. |
| Client / engagement ids | **Not created.** There are no deployed UAT records or IDs to record until the trusted test workspace flow is enabled and verified. |
| SharePoint site/library/root ids | values returned by `/api/integrations/status` after the site grant and secret are configured |
| Email provider | `SERVICE_BINDING` is configured; recipient verification and a controlled UAT delivery are still unverified |

Do not store passwords, tokens, real client evidence or actor identity assertions
in this file. The no-auth deployment boundary remains: use synthetic data and a
trusted test environment; persona selection is not authentication.
