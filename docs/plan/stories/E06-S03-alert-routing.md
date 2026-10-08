# E06-S03 — Alert routing for errors, outbox, archive overdue and login abuse

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S03 | E06 | Ops | P1 | M | E02-S01 | NFR REL-04, REL-05, OBS-02 |

## Intent
Structured logs already exist (`workspace.api.request`, `workspace.api.error`, outbox snapshot, `workspace.archive.overdue`). Nobody is notified. Route them to the firm.

## Read first
- `worker/observability.ts`, `worker/index.ts` `scheduled()` + `logScheduledOperationalMetrics`
- Current Cloudflare Workers Logs / Logpush / Notifications documentation (fetch; choose the simplest supported mechanism on the firm's plan)

## Acceptance criteria
1. Decision recorded in `docs/ops/alerting.md`: mechanism (e.g. Workers Logs alerts/Notifications, Logpush to a log tool, or an in-Worker alert email via the outbox) with justification and cost.
2. Alerts defined and fire-drilled on staging: 5xx > 2 % / 10 min; outbox job attempts ≥ 5; `workspace.archive.overdue` any; `LOGIN_FAILED` > 50 / 10 min; readiness `503` on scheduled probe.
3. If in-Worker alerting is chosen: alert emails are deduplicated (max 1 per alert type per hour), go to a configured `ALERT_RECIPIENTS` list, and never include personal data.
4. Runbook entries: what each alert means and first response steps.

## Verify with
Fire-drill evidence in `docs/ops/alerting.md`; unit tests for any in-Worker alert logic.
