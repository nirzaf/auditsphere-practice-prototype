# Staging load-test report template

Copy this file to `docs/quality/load-test-YYYY-MM-DD.md` only after a complete
remote benchmark has run against the dedicated, trusted staging Worker. The
current product has no application authentication. These virtual users are
self-selected synthetic workflow personas, not authenticated identities.

## Run identity

| Field | Value |
|---|---|
| Test date (UTC) | TODO |
| Staging URL | TODO |
| Staging Worker build ID | TODO |
| Synthetic workspace ID | TODO |
| Virtual users / PREPARER profiles | TODO / 50 |
| Duration | TODO / at least 900 seconds |
| Start and end (UTC) | TODO |
| Benchmark JSON | TODO |
| Operator | TODO |

## Application latency and errors

Paste the sanitized benchmark report's actual values. Do not include response
bodies, credentials, contact data, or workspace contents.

| Route family | Requests | Errors / error rate | p50 | p95 | p99 | Target |
|---|---:|---:|---:|---:|---:|---:|
| Workspace context read | TODO | TODO | TODO | TODO | TODO | p95 < 400 ms; p99 < 1,000 ms |
| Paginated client-list read | TODO | TODO | TODO | TODO | TODO | p95 < 400 ms; p99 < 1,000 ms |
| Client-create command | TODO | TODO | TODO | TODO | TODO | p95 < 800 ms |

Observed route mix: TODO reads / TODO commands (requested 70/30). Total requests
and average requests/second: TODO / TODO.

## Cloudflare staging dashboard metrics

Use the same UTC window as the benchmark. Record the Worker and D1 dashboard
views used; do not substitute production metrics.

| Metric | p50 | p95 | p99 | Source / time window |
|---|---:|---:|---:|---|
| D1 rows read per minute | TODO | TODO | TODO | TODO |
| D1 rows written per minute | TODO | TODO | TODO | TODO |
| Worker CPU time | TODO | TODO | TODO | TODO |
| Outbox queue-to-complete time | TODO | TODO | TODO | TODO |

## Acceptance

- [ ] Isolated staging Worker, D1 and R2 confirmed; target is not production.
- [ ] 50 distinct PREPARER workflow profiles ran for at least 15 minutes.
- [ ] Read p95 < 400 ms and p99 < 1 s.
- [ ] Command p95 < 800 ms, excluding async outbox processing.
- [ ] Error rate and D1/CPU/outbox metrics reviewed against NFR PERF-01–05 and CAP-01.
- [ ] Every failing NFR has a measured cause and linked follow-up story.
- [ ] All created data is synthetic and the dedicated staging workspace was reset or removed.

## Follow-ups and cleanup

TODO. Keep the cleanup scoped to the dedicated staging dataset. Do not delete
production records, attempt to reset production, or treat persona selection as
authentication evidence.
