# Integration configuration (email, SharePoint/Graph, UAT environment)

This runbook covers the three items the completion backlog recorded as externally
blocked. The repository now declares and implements each integration with a
fail-closed, honest state; the remaining work is supplying the external resources
and secrets, which only the operating firm (tenant owner) can do.

Until the values below are supplied, the application reports the integration as
`UNCONFIGURED` and never fabricates a send or a "live connected" success.

Verify the current state of every integration at any time:

```sh
curl -s https://<worker-url>/api/integrations/status
# {
#   "email": { "configured": false, "transport": "UNCONFIGURED" },
#   "sharepoint": { "state": "UNCONFIGURED", "siteHostname": null, ... }
# }
```

## 1. Email delivery (US-GAP-05 / US-GAP-06)

The business Worker dispatches proposal and commercial documents through the
`EMAIL_PROVIDER` service binding (`worker/businessOutbox.ts`), which expects a
`POST /send` multipart request and a `{ messageId }` reply. Two supported options:

### Option A — standalone provider Worker + Cloudflare Email Routing (no third party)

```sh
# 1. Enable Email Routing for your domain and verify the sender address, then
#    add a send_email binding to worker/emailProvider/wrangler.jsonc:
#      "send_email": [{ "name": "SEND_EMAIL", "destination_address": "audit-dispatch@your-firm.example" }]
# 2. Deploy the provider Worker.
wrangler deploy --config worker/emailProvider/wrangler.jsonc
# 3. Bind it into the business Worker: uncomment the "services" entry in wrangler.jsonc
#      "services": [{ "binding": "EMAIL_PROVIDER", "service": "auditsphere-email-provider" }]
# 4. Deploy the business Worker.
npm run cloud:deploy
```

### Option B — standalone provider Worker + transactional email API

```sh
wrangler secret put EMAIL_API_KEY --config worker/emailProvider/wrangler.jsonc
# set EMAIL_API_URL / EMAIL_FROM / EMAIL_FROM_NAME vars in the same config, then
wrangler deploy --config worker/emailProvider/wrangler.jsonc
# and bind/deploy the business Worker exactly as in Option A steps 3-4.
```

Required external inputs (firm-owned):
- A verified sender domain/address the firm is authorised to send from.
- Either Email Routing enabled, or an API key for a transactional email provider.
- Approved **test recipients** (no real client recipients during UAT).

Note: obtaining/verifying the sender domain and email API credentials requires the
firm's DNS/tenant access and cannot be completed from this repository.

## 2. SharePoint / Microsoft Graph (US-GAP-25 – US-GAP-28)

The adapter (`worker/integrations/sharepoint.ts`) resolves the configured site to
stable site/drive/root identifiers, creates canonical folders, uploads file bytes,
lists versions and reads retention state. It needs a Microsoft Entra app
registration with application permission to the designated site.

Required external inputs (firm-owned):
- `SHAREPOINT_TENANT_ID` — Microsoft Entra tenant id.
- `SHAREPOINT_CLIENT_ID` — app registration (client) id.
- `SHAREPOINT_CLIENT_SECRET` — client secret (store with `wrangler secret put`).
- `SHAREPOINT_SITE_HOSTNAME` — e.g. `contoso.sharepoint.com`.
- `SHAREPOINT_SITE_PATH` — e.g. `/sites/audit-test` (the **existing** test site).
- `SHAREPOINT_DRIVE_NAME` — the document library (default `Documents`).

```sh
wrangler secret put SHAREPOINT_CLIENT_SECRET
# uncomment/adjust the "vars" block in wrangler.jsonc with the identifiers above
npm run cloud:deploy
curl -s https://<worker-url>/api/integrations/status   # sharepoint.state should become CONNECTED
```

Grant the app the least privilege that still satisfies the site (prefer a
`Sites.Selected` grant scoped to the one test site over tenant-wide
`Sites.ReadWrite.All`). Tenant consent, the site path and the client secret are the
firm's to provide; they cannot be created here.

## 3. UAT environment and existing accounts (US-GAP-30 – US-GAP-32)

The behavioural journeys must run against the supplied accounts, deployed build and
the live test site. Populate the non-secret manifest below before acceptance:

| Field | Source |
| --- | --- |
| Application URL | deployed business Worker URL |
| Deployed build identity | the commit/build SHA under test |
| Existing account → persona/grade | supplied login accounts mapped to PREPARER/REVIEWER/APPROVER/CLIENT |
| Client / engagement ids | supplied workspace + seeded client/engagement |
| SharePoint site/library/root ids | values returned by `/api/integrations/status` once CONNECTED |
| Provider environment | which email transport (A or B) is active |

Do not store passwords, tokens or personal client evidence in this file.
