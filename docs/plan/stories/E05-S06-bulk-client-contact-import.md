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
