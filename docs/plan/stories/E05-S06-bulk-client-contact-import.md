# E05-S06 — Bulk client and contact import from the incumbent platform

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E05-S06 | E05 | Feature | P1 | M | SP-03 (export format), M3 | §1.1 "Elimination of per-file licensing penalties … unlimited client entities, historical engagements" |

## Intent
Move the firm's existing client book off the licence-capped platform without re-typing it. Scope is **clients, affiliations, contacts and contact routes** only; historical engagements/working papers are out of scope unless SP-03 recommends otherwise.

## Read first
- SP-03 result (`docs/plan/spikes/SP-03-incumbent-platform-export.md`)
- `worker/business.ts` `client.create`, `client.affiliation.add`, `contact.create`, `contact.route` validation (reuse, do not duplicate)
- `worker/businessTb.ts` TB import staging pattern (chunked, resumable) — mirror its approach
- `docs/contracts/data-model-delta.md` §5

## Acceptance criteria
1. CSV template documented in `docs/ops/client-import.md` (columns, required/optional, enums `HOLDING|SUBSIDIARY|STANDALONE`, contact roles, route purposes, `external_ref` unique per row).
2. `clientImport.validate` (Partner APPROVER) parses a committed CSV file version and produces a `client_import_runs` report: per-row errors (missing name, unknown parent ref, cycle, duplicate `client_code`, invalid email, unknown route purpose), counts; nothing created.
3. `clientImport.apply` on a `VALIDATED` run with 0 errors creates all records using the same validation functions as the single-record commands, in chunks ≤ 500 rows per batch, resumable via `client_import_row_map`; parents before subsidiaries.
4. Re-applying the same file (same SHA-256) is rejected (`UNIQUE (workspace_id, source_sha256)`).
5. 5,000-row synthetic file validates < 60 s and applies < 5 min on staging.
6. Audit trail: one `audit_events` row per run + per created entity (existing command semantics).

## Constraints
Validation logic is shared with existing commands — no second copy of client/contact rules.

## Verify with
```bash
npx tsx --test tests/unit/clientImport.test.ts && npm run test:unit
```

## Implementation and acceptance status — 2026-10-09

- **Code implemented:** canonical CSV upload and Partner-only validation; per-row error reports without business-record writes; duplicate source SHA-256 rejection; shared `client.create` and `client.affiliation.add` builders; parent-first apply in 40-row atomic batches; resume through `client_import_row_map`; contact routes and affiliations; chained audit events for every created client, contact, route, and affiliation.
- **Local evidence:** `tests/unit/clientImport.test.ts` exercises malformed/quoted CSV, row-level invalid email/unknown parent/hierarchy cycle/route errors, no-write validation, duplicate file rejection, 42-row parent-first import over two commands, resume mapping, and entity audit counts. Local typecheck also passes.
- **Local 5,000-row diagnostic — 2026-10-09:** opt in with `$env:AUDITSPHERE_CLIENT_IMPORT_BENCHMARK_5K='1'; npx tsx --test --test-concurrency=1 tests/unit/clientImport.test.ts`. The real Worker command path validated 5,000 synthetic rows in 235 ms and applied them in 27,052 ms across 125 resumable 40-row commands using in-memory SQLite D1 and a memory-backed R2 test double. The run reconciled 5,000 imported clients, contacts and row mappings, two contact routes, two affiliations, and the chained audit-event count. This is a local diagnostic, not a Cloudflare staging measurement or acceptance pass.
- **Verification — 2026-10-09:** `npm run test:unit` passed (197 passed, 1 opt-in stress test skipped, 0 failed); `npm run build` and `npm run cloud:typecheck` passed. The concurrency regression verifies all four audit rows per client command (client, contact, and two routes). A local browser walkthrough could not be started: Wrangler hit sandbox `EACCES` while binding its loopback inspector and `EPERM` writing its user log. The production Worker was not used for UI testing.
- **Open acceptance:** repeat the 5,000-row `<60s` validation and `<5m` apply targets on an isolated staging workspace backed by the deployed Cloudflare Worker/D1/R2, and record the build/resource identity. The local diagnostic met the elapsed-time targets on its test adapter but cannot establish Cloudflare staging performance. Cloudflare currently exposes Production only; no production database was used for this test.
- **Open dependency:** SP-03 still needs the incumbent platform name, owner-approved day-one scope, and an anonymized sample export/mapping. The importer implements the generic canonical CSV contract but does not claim that it maps the firm’s unknown incumbent export.
