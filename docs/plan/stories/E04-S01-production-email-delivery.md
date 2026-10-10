# E04-S01 — Production email: sender domain, route-bound recipients, delivery status

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E04-S01 | E04 Comms & intake | Feature + Ops | P0 | M | E02-S01; decision D6 (sender domain) | §3.1 dispatch, §4.1.1 routing, §4.1.5 receipts/credentials, §4.3.4 holding letters |

## Intent
Every client-facing document the system already generates (proposal, EL, invoice, receipt, PBC notices, holding letter, bundle, portal credentials, password reset) is actually delivered to the routed contact in production, with traceable status.

## Read first
- `worker/emailProvider/handler.ts` (transports `CLOUDFLARE_EMAIL_SERVICE` / `HTTP_API`, `EMAIL_ALLOWED_RECIPIENTS`), `worker/emailProvider/wrangler.jsonc` (sender `audit-dispatch@mail.steaudit.com`, single allowed destination)
- `worker/businessOutbox.ts` (`COMMERCIAL_EMAIL`, dispatch rows), `dispatches` table (`0009`, rebuilt in `0019`: statuses `QUEUED, ACCEPTED, DELIVERED, BOUNCED, FAILED, UNKNOWN`)
- `docs/ops/integrations.md` (moved in E01-S01)

## Current state (verified 2026-10-10)
GitHub Actions run [37999901510](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/37999901510)
deployed the checked-in routed REST provider configuration. The Cloudflare
production dashboard showed `auditsphere-email-provider` version `e92a09d6` Ready
at 100% traffic with Workers.dev disabled. Its workflow step succeeded but
displayed an unexplained bare `Error:` line; investigate this on the next
provider deployment. This provider replaces the earlier dashboard-only native
`SEND_EMAIL` configuration (version `684f342b`). The GitHub environment's
`CLOUDFLARE_EMAIL_SENDING_TOKEN` was updated on 2026-10-10 at 01:33 GMT+3 and
`CLOUDFLARE_API_TOKEN` at 03:34 GMT+3. GitHub Actions run [38009173135](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/38009173135)
started before that deployment-token update; it passed `verify` but stopped on
the R2 lock-read HTTP 403 before deploying the provider or business Worker. The
current deploy token lacks R2 bucket-configuration permission. The application
readiness job passed in the earlier deployment, but no successful application
email delivery or mailbox receipt is recorded.

The M365 Admin Center confirmed `steaudit.com` is Healthy in the tenant that
owns it, and Exchange confirmed `audit@steaudit.com` is an alias on the owner's
M365 mailbox. The former Exchange rule that BCCed an owner-selected external
address was disabled on 2026-10-09. Normal alias delivery and the M365 apex MX
remain in place. The Worker has no inbound email-routing trigger and does not
ingest mailbox content. Cloudflare Email Preview remains enabled by the owner's
choice; this is an accepted provider-console privacy exception, not proof of
the strict no-content-in-logs criterion.

## Step 0 — Verify transport capability (no code)
Fetch current Cloudflare documentation for the `send_email` binding / Email Service and record in the PR: can it send to **arbitrary external recipients** from a verified domain, and with what limits? If **not**, production must use the `HTTP_API` transport with a transactional email provider chosen by the firm (owner decision; the provider becomes a data processor — add it to SP-04's inventory).

## Scope
**In:** recipient policy modes in the provider: `ALLOWLIST` (staging; current behaviour) and `ROUTED` (production) where the business Worker is the only caller (service binding, `workers_dev:false`) and the provider requires each message to carry `routeId` + `recipientSha256`, re-validating that the address is a syntactically valid, non-role-blocked address; SPF/DKIM/DMARC records documented for the sender domain; delivery status updates (`ACCEPTED`/`DELIVERED`/`BOUNCED`) recorded on `dispatches` from provider responses or webhook (HTTP_API) — webhook endpoint authenticated with an HMAC secret; staff-visible dispatch history per engagement already rendered — confirm it shows the new statuses.
**Out:** marketing email, inbound email parsing, retries beyond the existing outbox policy.

## Acceptance criteria
1. Staging continues to reject non-allowlisted recipients (existing `tests/unit/emailProvider.test.ts` green).
2. Production config (`env.production`) uses `ROUTED` mode; a config test asserts staging ≠ production policy and that production has no public route to the provider.
3. A message without a matching `routeId`/hash in `ROUTED` mode is rejected before transport (unit test).
4. Status webhook (HTTP_API only): valid HMAC → status updated idempotently; invalid HMAC → `401`, no change; replay of the same event → no duplicate history.
5. `docs/ops/email.md`: DNS records, sender address, bounce handling, how to rotate the API key, how to verify delivery (owner checklist).
6. Live check on staging: one EL email delivered to an owner-controlled external mailbox, recorded (date, dispatch ID, provider message ID) in `docs/ops/uat-log.md`.

## Constraints
No email content (body/attachments) in logs. Keep the provider Worker free of business logic beyond policy enforcement.

## Verify with
```bash
npx tsx --test tests/unit/emailProvider.test.ts tests/unit/wranglerConfig.test.ts && npm run test:unit
```

## Stop and ask if
- Step 0 shows Cloudflare cannot send to external recipients and the firm has not chosen an ESP.
