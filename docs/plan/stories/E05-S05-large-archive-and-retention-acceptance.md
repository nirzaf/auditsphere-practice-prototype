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

## Current execution status (2026-10-09)

**Blocked on isolated staging infrastructure; not accepted.** A read-only review
of the built-in Cloudflare dashboard shows the main Worker has only the
Production environment and offers “Create your first Preview.” Its current D1,
R2, and email bindings are production bindings. No isolated staging Worker,
database, or archive bucket was available, so this run did not create records,
advance `archive_due_at`, exercise object-lock mutations, or run against those
production resources.

- **AC1 — blocked:** no staging engagement or ≥2 GiB synthetic dataset was
  created; the normal 60-day and early Partner-lock paths remain unverified on
  real staging infrastructure.
- **AC2 — partial local evidence only:** the local Worker browser journey covers
  the native archive download ticket and verifies the streamed ZIP against its
  sealed SHA-256 and size. The large archive and File System Access paths have
  local streaming/unit coverage, but have not been accepted on a real browser
  with a multi-gigabyte staging archive.
- **AC3 — blocked:** no staging R2 bucket lock was available for overwrite and
  delete canaries. No mutation was attempted on the production bucket.
- **AC4 — partial local evidence only:** existing local Worker coverage checks
  `423 WORKSPACE_FROZEN` for a post-seal archive note and ordinary file
  reservation, as well as the client portal upload freeze. This is not a full
  operator-recorded mutation matrix on a staging engagement.
- **AC5 — blocked:** no staging run measurements, archive sizes, operation
  durations, or staging operator result exist to record.

The built-in-browser preflight is recorded in `docs/ops/uat-log.md`. To unblock,
provide a separate non-production Worker with isolated D1 and R2 bindings and
retention lock enabled. Do not use the current production resources or weaken
their retention policy for this acceptance.

## Stop and ask if
Any step requires production credentials.
