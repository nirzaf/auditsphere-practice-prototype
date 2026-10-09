# AuditSphere operational alerts

## Decision

Use Cloudflare-native Workers Logs Custom Alerts for numeric thresholds and
Workers Issues for grouped Worker failures. This keeps application telemetry in
the existing Cloudflare account and avoids a new log processor, Logpush
destination, or in-Worker alert mail/outbox path. Custom Alerts can query only
datasets exposed to the selected account/zone and plan; verify availability,
query limits, and any usage charges in the Cloudflare dashboard before enabling
them. Do not enable a paid data destination or add personal data to alert
queries.

Use Cloudflare Notifications email to deliver alerts to the explicitly approved
operations inbox once the staging fire drill is ready. This is separate from the
application Email Service provider allowlist and does not require changing the
`steaudit.com` apex MX. Do not route the apex through Cloudflare Email Routing.

The Worker emits JSON-encoded operational records for requests, outbox/archive
snapshots, and overdue archives. Logs avoid request bodies, email addresses,
file bytes, and exception messages. Before building Custom Alerts, confirm the
Cloudflare Logs dataset exposes the event name and numeric fields from these
records. If it indexes them only as message text, change the emitter to log
objects and deploy that change to staging before writing field-based queries.
Workers Issues can include request metadata and diagnostic context; review its
displayed payload before creating an external destination.

## Alert definitions and response

| Signal | Trigger | First response |
| --- | --- | --- |
| Worker 5xx rate | More than 2% of requests return 5xx in a rolling 10-minute window. Use a Workers Logs dataset/query if it is available for the staging Worker; compare the same request population for the numerator and denominator. | Open the Cloudflare Worker Issues view and deployment history. Check the affected route and current dependency readiness. Roll back only if the failure began with a deployment and the previous version is healthy. |
| Outbox retry pressure | `workspace.scheduled.metrics.outbox.maxAttempts >= 5`. | Inspect the oldest unfinished jobs and sanitized `last_error_code` values in the staging D1. Check the email/provider binding and other named dependency. Do not retry jobs manually until idempotency and the provider result are understood. |
| Archive overdue | Any `workspace.archive.overdue` event, or a nonzero `archives.overdueUnsealedCount` / `archives.failedDueCount` in `workspace.scheduled.metrics`. | Check the engagement due date and latest archive run. Verify required files and R2 object hashes; repair through the supported archive workflow and preserve the audit trail. |
| Readiness failure | A scheduled staging probe receives HTTP 503 from `/api/health/ready`. | Read the probe's dependency codes and compare them with staging bindings/secrets. Restore the missing dependency; do not bypass readiness or use production data for a staging drill. |

### Superseded login alert

The historical E06-S03 `LOGIN_FAILED > 50 / 10 min` signal is not applicable to
the current user-provided epic. The active product scope has no application
authentication or login endpoint. Do not introduce authentication or fabricate
login events to satisfy this old criterion. If the approved product scope later
adds authentication, define a replacement alert with its security owner before
release.

## Configuration and evidence status

The configuration and drill are **not complete**. The Cloudflare account
currently has a production business Worker and a separate production email
provider, but no isolated staging business Worker/D1/R2 environment. The public
Worker is not a safe staging substitute. Do not fire synthetic failures against
it and do not record production observations as staging evidence.

After the isolated staging Worker exists:

1. In the Cloudflare dashboard, open **Workers & Pages → `auditsphere-staging`
   → Settings** and enable **Issues**. Keep `observability.issues.enabled`
   enabled in the checked-in staging configuration before the next Wrangler
   deploy so the setting persists.
2. Open the staging Worker's **Issues** page and configure a notification
   destination only after reviewing the diagnostic fields and recipient access.
3. Open Cloudflare **Notifications → Custom Alerts**. Confirm that the account
   exposes an appropriate Workers Logs dataset and inspect its cost/limits.
   Build the 5xx, outbox-attempt, and archive-overdue alerts against staging,
   using the query builder's available fields and a common 10-minute request
   window for the 5xx numerator and denominator.
4. Add a scheduled probe for the staging `/api/health/ready` endpoint and route
   its 503 result to the same operations destination. Keep the probe synthetic
   and free of credentials in the URL.
5. Fire-drill each alert in staging using synthetic requests/jobs only. Record
   the alert ID/name, UTC trigger and recovery times, destination delivery
   result, and relevant staging build identity below. Do not include request
   bodies, addresses, secrets, or real client evidence.

| Drill | Status | Evidence |
| --- | --- | --- |
| 5xx rate > 2% / 10 min | Blocked: isolated staging Worker unavailable | None; no production drill performed |
| Outbox attempts >= 5 | Blocked: isolated staging Worker unavailable | None; no production job mutated |
| Archive overdue | Blocked: isolated staging Worker unavailable | None; no production archive mutated |
| Readiness 503 probe | Blocked: isolated staging Worker unavailable | None; production readiness is not a staging substitute |

## References

- [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/)
- [Cloudflare Workers Issues](https://developers.cloudflare.com/workers/observability/issues/)
- [Cloudflare Workers Issues automations](https://developers.cloudflare.com/workers/observability/issues/automations/)
- [Cloudflare Custom Alerts](https://developers.cloudflare.com/notifications/notification-available/)
