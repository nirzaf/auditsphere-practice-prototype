# E04-S03 — Public web-form lead intake and triage

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E04-S03 | E04 | Feature | P2 | M | M3; E06-S02 (rate limiter) | §4.1.1 "Ingest leads across … Web Forms"; US-M1-001 |

## Intent
Prospects submit an inquiry from the firm's website; staff triage it into a `WEB_FORM` lead. Today `WEB_FORM` exists only as a label staff pick manually.

## Read first
- `docs/contracts/api-delta.md` §4, §3 (`publicLead.triage`); `docs/contracts/data-model-delta.md` §4
- `worker/business.ts` `lead.create` (pattern + validation), `leadSourceSchema` (L832)

## Acceptance criteria
1. Migration `0051_public_lead_submissions.sql`; schema version bump.
2. `POST /api/public/leads`: no session; validates body (zod strict); verifies Cloudflare Turnstile token server-side (`TURNSTILE_SECRET_KEY`); honeypot field `website` non-empty → stored `REJECTED_SPAM`, `202`; rate limit 5/hour per IP hash; CORS only for `PUBLIC_LEAD_ALLOWED_ORIGINS`; stores `ip_sha256` (salted with a secret, never raw IP).
3. Duplicate detection: same normalised email within 30 days → status `DUPLICATE` linked to existing lead if any; still `202`.
4. Staff list: "Web inquiries" queue (`lead.read`) with status filter; `publicLead.triage` ACCEPT creates a lead (`source='WEB_FORM'`, receipt time = submission time) and links it; SPAM/DUPLICATE close it. Optimistic version on the submission row.
5. Optional notification email to a configured firm inbox on new submission (outbox), off by default.
6. Embeddable snippet documented in `docs/ops/web-form.md` (HTML form + Turnstile widget) — the app itself does not host marketing pages.
7. Tests: valid, invalid, honeypot, Turnstile failure (stubbed verifier), rate limit, duplicate, triage paths, persona denial.

## Constraints
No new dependency for Turnstile (single `fetch` to the siteverify endpoint). Response bodies never echo submitted data.

## Implementation progress — 2026-10-09
- Added the forward-only `0051_public_lead_submissions.sql` migration, schema version 51, strict public POST validation, server-side Turnstile verification, exact-origin CORS, honeypot storage, duplicate detection, HMAC IP redaction and a fail-closed rolling five-per-hour D1 limiter.
- Added the `lead.read` Web inquiries queue and status filter, plus `lead.manage` acceptance/spam/duplicate triage with optimistic versions. Accept requires service and audited period, links/creates the client and primary contact, and preserves original receipt time.
- Optional inbox notification is disabled by default; when configured, a minimal submission-reference job enters the existing email outbox. Added the HTML/Turnstile embed runbook.
- Acceptance coverage includes valid/invalid requests, Turnstile rejection, honeypot, CORS, duplicates, hourly rate limits, triage, reviewer denial and queued/delivered optional notification. Focused tests and Worker typecheck pass.
- Production/staging still need the secret `PUBLIC_LEAD_IP_HASH_SECRET` (32+ characters), and the deployment must configure the matching Turnstile secret and allowed form origin before external submissions can work.

## Verify with
```bash
npx tsx --test tests/unit/publicLeadIntake.test.ts && npm run test:unit
```
