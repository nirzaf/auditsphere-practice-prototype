# Integration configuration (email, SharePoint/Graph, UAT environment)

This runbook covers the three items the completion backlog recorded as externally
blocked. It records the integration code and configuration in the repository and
the account-owner steps that still gate live acceptance. Integration status must
come from the deployed Worker; local configuration is not evidence of connectivity.

Production commit `0689461738caf33ae13290809f063ccebf032374` is deployed at the
application URL below. The latest GitHub Actions run passed typecheck, unit tests,
build, browser E2E, provider deployment, D1 migrations, Worker deployment, and
readiness. The integration probe still reflects account-side setup: email is bound
through `SERVICE_BINDING`, while SharePoint remains unconfigured until its site
grant and client secret are present. A healthy deployment does not by itself
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
approved UAT recipient `testing@mail.steauditing.com` has been added to Cloudflare
Email Service. Its verification was resent, but the dashboard still shows
`Pending`. The mailbox owner must open the message and follow its verification link.
Do not send an application message until Cloudflare shows it Verified and a
controlled UAT delivery succeeds.

The requested inbound alias is `audit@steaudit.com` → `fazrin@quadrate.lk`; the
destination is verified. Do not enable Cloudflare Email Routing for the root zone
while its apex MX points to Microsoft 365: onboarding replaces the root-domain
mail exchanger and can interrupt all `@steaudit.com` inbound mail. Keep the current
MX and configure the alias through Microsoft 365, or get approval for a full mail
migration before switching the root MX to Cloudflare.

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
site owner, but has not yet been applied. The Worker config already contains the
non-secret tenant, app, site hostname/path, and `Documents` library values. Its
`SHAREPOINT_CLIENT_SECRET` is still absent from Cloudflare.
That separate grant must be applied by an authorized SharePoint administrator using
a grant-authority session (for example, PnP PowerShell with delegated Graph
`Sites.FullControl.All`). The target app remains limited to `Sites.Selected`; do not
give it tenant-wide `Sites.ReadWrite.All` or `Sites.FullControl.All`.

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

## 3. UAT environment and existing accounts (US-GAP-30 – US-GAP-32)

The behavioural journeys must run against the supplied accounts, deployed build and
the live test site. Populate the non-secret manifest below before acceptance:

| Field | Source |
| --- | --- |
| Application URL | https://auditsphere-visual-prototype.quadrate-lk.workers.dev (readiness returns `ready`) |
| Deployed build identity | `0689461738caf33ae13290809f063ccebf032374` |
| Existing account → persona/grade | supplied login accounts mapped to PREPARER/REVIEWER/APPROVER/CLIENT |
| Client / engagement ids | supplied workspace + seeded client/engagement |
| SharePoint site/library/root ids | values returned by `/api/integrations/status` once CONNECTED |
| Provider environment | which email transport (A or B) is active |

Do not store passwords, tokens or personal client evidence in this file.
