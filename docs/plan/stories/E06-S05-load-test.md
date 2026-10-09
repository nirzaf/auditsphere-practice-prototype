# E06-S05 — Load test at 50 synthetic workflow users

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S05 | E06 | Quality | P1 | M | M3; SP-02 | NFR PERF-01…05, CAP-01 |

## Intent
Measure the current no-application-auth system against the NFR workload model on an isolated staging Worker and record headroom. Each virtual user sends a self-selected PREPARER actor profile; this measures concurrency and workflow behavior, not authentication or identity assurance. This scope follows the real-implementation epic and `docs/product/prd.md`.

## Read first
- `tools/benchmark-local-worker-20-users.ts` (existing local benchmark; extend, don't replace)
- `docs/architecture/nfr.md` §2, SP-02 result

## Acceptance criteria
1. Extend `tools/benchmark-local-worker-20-users.ts` to support `--target <staging URL>`, an existing isolated synthetic `--workspace-id`, `--build-id`, `--users 50`, and a mixed read/command profile (70/30) over 15 minutes. Resolve distinct PREPARER actor-profile IDs from that workspace. Do not add cookies, login, or password handling. Refuse production and unlabeled target hosts, and require an explicit synthetic-staging acknowledgement.
2. Report `docs/quality/load-test-<date>.md`: p50/p95/p99 per route family and error rate from the benchmark; D1 rows read/written per minute and Worker CPU time percentiles from the Cloudflare dashboard; outbox drain time from sanitized staging outbox metrics. Include the deployed build identity, actual actor/request counts and test window.
3. PERF-01…PERF-05 pass, or failing items have a linked follow-up story with a measured cause.
4. Use only synthetic data in a dedicated staging Worker, D1 database and R2 bucket. Keep the run's client codes unique and document cleanup by resetting or removing that isolated staging dataset; never run the target workload against production.

## Scope and environment blockers
The application has no authentication, and the current production Worker is public. The account currently has no isolated staging business Worker/D1/R2 environment. Do not treat the public production Worker as staging or enable public workspace bootstrap to make this story pass. Configure a separate trusted staging perimeter and isolated resources before running the remote profile.
