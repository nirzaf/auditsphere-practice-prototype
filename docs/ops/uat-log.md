# User acceptance test log

This log records only observed test evidence. Never include email bodies,
attachments, passwords, tokens, or client data.

| Story | Date | Environment | Test | Dispatch ID | Provider message ID | Recipient approval | Observed result |
|---|---|---|---|---|---|---|---|
| E04-S01 | Not run | Staging | Synthetic engagement-letter delivery | — | — | Approved non-production destination; Cloudflare last showed `testing@mail.steauditing.com` as Pending on 2026-10-07 | Blocked: destination verification and a live staging delivery have not been evidenced |

Before recording a successful E04-S01 result, verify the test destination in
Cloudflare, send one synthetic EL from the staging environment, confirm receipt,
and enter the exact dispatch ID, provider message ID, date, and status above.

## Staging archive acceptance

| Story | Timestamp (UTC) | Environment | Dataset | Duration | Operator | Observed result / evidence |
|---|---|---|---|---|---|---|
| E05-S05 | 2026-10-09 11:20 | Cloudflare dashboard preflight | None created | Not run | Read-only owner-session inspection | **Blocked.** Built-in browser showed only the main Worker's Production environment and “Create your first Preview”; existing bindings point to production D1/R2. No staging canary or data mutation was attempted. See the story's current execution status. |

Record an acceptance row only after using an isolated non-production Worker,
D1 database, and R2 bucket. Include the synthetic source/archive sizes, both
download paths' durations and hashes, lock canary outcomes, and the operator.
Do not record a production-bucket overwrite or deletion attempt as a staging
canary.

## Accessibility and keyboard-only acceptance

| Story | Date | Environment | Test | Observed result / evidence |
|---|---|---|---|---|
| E06-S04 | 2026-10-09 | Local synthetic D1/R2 Worker; not deployed UAT | Keyboard-only lead-to-CLIENT-portal walkthrough | **Partial; upload blocked by workflow prerequisites.** Using Tab, typing, arrow keys and Enter only, created a synthetic workspace, Partner-approved test standards profile, PREPARER profile, lead/client/contact and engagement, then assigned a contact-scoped CLIENT profile and entered the CLIENT projection. The portal showed `Portal not active`; the UI states that uploads open only after commercial handover and the advance is fully settled with committed receipt evidence. No risk conclusions, commercial approvals, payment, receipt, or upload were fabricated. The separate automated axe run passed eight desktop/mobile scans (landing, setup, populated staff modules and CLIENT projection) with zero critical, serious or moderate violations. This local evidence does not establish deployed UAT or complete the upload acceptance criterion. |

## UAT and go-live preparation

| Story | Date | Environment | Test | Observed result / evidence |
|---|---|---|---|---|
| E06-S06 | 2026-10-09 | Documentation preparation only | Five E2E journeys, 23 blocking scenarios, release gates and rollback checklist | **Prepared; execution not run.** See `uat-plan.md` and `go-live-checklist.md`. No staging Worker/D1/R2 or trusted perimeter exists because the SP-04 residency/transfer decision is open. The production Worker is not a safe UAT target. Current scope has no application authentication, so persona selection is not a real login. No deployment, synthetic failure drill, or client data entry was performed. |
