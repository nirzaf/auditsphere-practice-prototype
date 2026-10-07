# Integration configuration (email, SharePoint/Graph, UAT environment)

This runbook covers the three items the completion backlog recorded as externally
blocked. It records the integration code and configuration in the repository and
the account-owner steps that still gate live acceptance. Integration status must
come from the deployed Worker; local configuration is not evidence of connectivity.

Production build identity `157a30f26a0498a3dbbcd31af6fcdd42eac24c53` was deployed
from `main` by [GitHub Actions run 37685670419](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/37685670419).
The run passed app/Worker typecheck, unit tests, production build, the complete
browser E2E suite, Email Service provider deployment, D1 migrations, Worker/static
asset deployment, and readiness. A live `GET /api/integrations/status` check at
2026-10-07 17:09 UTC reported email `configured: true` with transport
`SERVICE_BINDING`; SharePoint reported `UNCONFIGURED` because
`SHAREPOINT_CLIENT_SECRET` is missing. A healthy deployment does not by itself
establish email delivery or SharePoint connectivity.

Verify the current state of every integration at any time:

```sh
curl -s https://<worker-url>/api/integrations/status
# {
#   "email": { "configured": true, "transport": "SERVICE_BINDING" },
#   "sharepoint": { "state": "UNCONFIGURED", "siteHostname": "easyguide.sharepoint.com", ... }
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
application permission `Sites.Selected`. The site-specific `write` grant to
`https://easyguide.sharepoint.com/sites/AuditSphereJSAcceptance` is approved by the
site owner, but the grant was not applied in the inspected SharePoint admin
session. The Worker config already contains the non-secret tenant, app, site
hostname/path, and `Documents` library values. Its `SHAREPOINT_CLIENT_SECRET` is
still absent from Cloudflare; the live status endpoint confirms this secret is
the current configuration failure.
That separate grant must be applied by an authorized SharePoint administrator using
a grant-authority session (for example, PnP PowerShell with delegated Graph
`Sites.FullControl.All`). The target app remains limited to `Sites.Selected`; do not
give it tenant-wide `Sites.ReadWrite.All` or `Sites.FullControl.All`.

The SharePoint Admin Center session reviewed on 2026-10-07 can see the approved
acceptance site and its site settings/membership, but does not expose a Graph
`Sites.Selected` app-permission grant action. No site grant was applied in that
session.

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
same site and app before supplying the client secret.

```sh
# configure the SHAREPOINT_* non-secret vars in wrangler.jsonc
# after the site grant, enter SHAREPOINT_CLIENT_SECRET directly as a Worker secret
# in Cloudflare; never paste it into chat or commit it
npm run cloud:deploy
curl -s https://<worker-url>/api/integrations/status   # sharepoint.state should become CONNECTED
```

The firm-approved site path and client secret remain owner-supplied; tenant consent
for `Sites.Selected` has already been granted. Keep all site-specific access on the
acceptance site only.

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
| Deployed build identity | `157a30f26a0498a3dbbcd31af6fcdd42eac24c53` (latest verified deployment recorded 2026-10-08) |
| Workspace and actors | synthetic workspace created through the UI; verify all four selectable personas and persisted context |
| Client / engagement ids | synthetic records created through visible UI journeys; record IDs in the restricted UAT evidence bundle |
| SharePoint site/library/root ids | values returned by `/api/integrations/status` after the site grant and secret are configured |
| Email provider | `SERVICE_BINDING` is configured; recipient verification and a controlled UAT delivery are still unverified |

Do not store passwords, tokens, real client evidence or actor identity assertions
in this file. The no-auth deployment boundary remains: use synthetic data and a
trusted test environment; persona selection is not authentication.
