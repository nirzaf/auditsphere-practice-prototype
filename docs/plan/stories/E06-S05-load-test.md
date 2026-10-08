# E06-S05 — Load test at 50 authenticated sessions

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S05 | E06 | Quality | P1 | M | M3; SP-02 | NFR PERF-01…05, CAP-01 |

## Intent
Measure the authenticated system against the NFR workload model on staging and record headroom.

## Read first
- `tools/benchmark-local-worker-20-users.ts` (existing local benchmark; extend, don't replace)
- `docs/architecture/nfr.md` §2, SP-02 result

## Acceptance criteria
1. Benchmark tool supports `--target <staging URL>`, session cookies from pre-created test accounts (staging-only bootstrap), `--users 50`, mixed read/command profile (70/30) over 15 minutes.
2. Report `docs/quality/load-test-<date>.md`: p50/p95/p99 per route family, error rate, D1 rows read/written per minute (from Cloudflare analytics), Worker CPU time percentiles, outbox drain time.
3. PERF-01…PERF-05 pass, or failing items have a linked follow-up story with a measured cause.
4. Test data created by the run is synthetic and removable (separate staging workspace or documented cleanup).
