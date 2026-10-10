# E04-S04 — SharePoint: finalise credentials or disable cleanly

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E04-S04 | E04 | Ops | P2 | S | Owner decision under ADR-0007 | not in spec (optional mirror) |

## Intent
Stop carrying a `FAILED` integration. Either the owner completes the Entra secret rotation and the mirror is verified, or the integration is cleanly disabled.

## Current state (verified 2026-10-10)
The site-only `write` grant on `/sites/AuditSphereJSAcceptance` was previously
verified. The most recent recorded live probe is still `FAILED` because Graph
rejects the token request; no later status or folder/upload/version round trip
has been recorded. In the signed-in Entra app-registration UI, the
`AuditSphere SharePoint UAT` registration showed two client-secret rows, both
masked and expiring in April 2027. This confirms credentials exist, but their
values cannot be recovered from Entra and their validity is not proven by the
UI.

Path A remains the intended choice. Do not copy another client secret into the
production Worker: the repository has no isolated staging Worker/D1/R2 because
SP-04's residency/transfer decision is still open, and the current public
production Worker is not a safe SharePoint test target. Once D5 and staging are
approved and provisioned, create a fresh staging credential if required, save it
directly as the staging Worker secret, and verify token exchange plus the scoped
site round trip. The existing verified site grant remains limited to the chosen
acceptance site. No SharePoint change was made during this review.

## Path A — finalise (owner + agent)
1. Owner enters the current secret with `wrangler secret put SHAREPOINT_CLIENT_SECRET --env staging` (and production if wanted).
2. Agent runs/records `GET /api/integrations/status` → `CONNECTED`; performs one folder-create + upload + version-list round trip on staging via an existing adapter test entry point; records in `docs/ops/uat-log.md`.
3. Confirm the mirror is one-way: no application read path uses SharePoint (`rg -n "sharepoint" worker/business*.ts` shows only mirror calls).

## Path B — disable
1. Remove `SHAREPOINT_*` vars from the target env(s); readiness reports `NOT_CONFIGURED` (E02-S04 AC3).
2. If the owner wants it gone entirely: delete `worker/integrations/sharepoint.ts`, its status entry and `tests/unit/sharePointAdapter.test.ts`, and the env declarations.

## Acceptance criteria
- Exactly one path completed and recorded; readiness never reports SharePoint as `FAILED` in production.

## Stop and ask if
- The owner wants SharePoint as an application read source (contradicts ADR-0007 — needs a new ADR).
