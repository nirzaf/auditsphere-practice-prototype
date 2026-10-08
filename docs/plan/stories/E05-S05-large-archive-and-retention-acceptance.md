# E05-S05 — Large-archive and R2 retention-lock acceptance on staging

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E05-S05 | E05 | Verify | P0 | M | E02-S01 | §4.4.3 ISA 230 read-only archive; US-M4-008; NFR CMP-01 |

## Intent
Prove on real Cloudflare infrastructure (staging) that sealed archives are byte-verifiable at realistic sizes and that R2 retention rules actually block overwrite/delete.

## Read first
- `worker/streamingArchive.ts`, `worker/archiveRetention.ts`, `worker/r2-archive-locks.json`, `tools/{generate,apply}-r2-archive-lock-rules.ts`
- `tests/unit/streamingArchive.test.ts` (opt-in 4 GiB stress), `tests/unit/businessArchiveExport.test.ts`, `tests/unit/archiveDownloadTickets.test.ts`
- `docs/prototype/us-gap-completion-status.md` (US-GAP-29 paragraph) — or its successor in `docs/ops/`

## Acceptance criteria
1. Staging engagement with ≥ 2 GiB of synthetic committed files (incl. one ≥ 1 GiB file) is sealed via the normal 60-day path (time-shifted `archive_due_at` via an operator-only staging command, documented) and via early Partner lock.
2. Archive export downloaded through both browser paths (File System Access API and native download ticket) completes; client-side SHA-256 of the downloaded ZIP equals the sealed digest; size equals the recorded byte count.
3. Retention canary: attempt `PUT` (overwrite) and `DELETE` on a sealed object key with the S3 API / `wrangler r2 object` → both rejected by the bucket lock; result and commands recorded.
4. App-level: every mutating command on the sealed engagement returns the existing immutable/locked error; recorded matrix.
5. Results in `docs/ops/uat-log.md` with timestamps, sizes, durations, operator.

## Constraints
Synthetic data only. Do not weaken lock rules to make the test pass.

## Stop and ask if
Any step requires production credentials.
