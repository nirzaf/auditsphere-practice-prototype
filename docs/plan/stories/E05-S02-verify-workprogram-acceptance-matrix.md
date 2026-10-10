# E05-S02 — Verify workprogram and ad-hoc procedure acceptance (COMPLETE)

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E05-S02 | E05 | Verify → Fix | P1 | M | M3 (so tests run with real sessions) | §4.3.2; US-M3-004, US-M3-005, US-M3-009, US-M3-010 |

## Intent
Repository status says "remaining template/review matrices stay open" without naming them. Turn the story-doc acceptance criteria into one executable matrix, then fix only what fails.

## Read first
- `docs/product/source/ste-user-stories-v2.1.md` §US-M3-004, US-M3-005, US-M3-009, US-M3-010
- `worker/businessFieldwork.ts` (`workprogram.provision`, `procedure.insert/update/submit/review`, `review.*`)
- `tests/unit/fieldworkGates.test.ts`, fieldwork scenarios in `tests/unit/businessWorkspace.test.ts`

## Step 1 — Matrix test `tests/unit/fieldworkAcceptance.test.ts`
The acceptance helper registers one nested `node:test` assertion per AC against the shared seeded `worker.fetch` integration fixture in `tests/unit/businessWorkspace.test.ts`. This keeps the matrix on the real Worker and SQLite-backed workspace/session state without duplicating the fixture's setup:
| AC | Assertion |
|---|---|
| M3-004.1 | Provisioned workprogram for each applicable FSLI exposes Ownership, Valuation, Completeness, Existence, Cut-off procedures (or a recorded not-applicable rationale) |
| M3-004.2 | Procedure state persists across reload (GET after commands) |
| M3-004.3 | Procedure ↔ evidence link and unlink recorded; stale evidence blocks submission |
| M3-004.4 | Completed procedures submit; incomplete returns `VALIDATION_FAILED` with field names |
| M3-005.1 | Ad-hoc insert rejects missing title / instructions / reason (each separately) |
| M3-005.2 | Inserted step is part of the active workprogram and required for submission |
| M3-005.3 | Insertion appears in procedure revisions and change feed with actor + reason |
| M3-009 | Preparer submit locks the procedure from further preparer edits |
| M3-010 | Reviewer return requires comment; status → under rework; preparer can edit; resubmission references the new revision; reviewer cannot approve own preparation |
| Persona | Preparer cannot review; RED procedures require Manager+ execution; Partner clearance for RED |

## Step 2 — Fix
For each failing row: minimal change in `worker/businessFieldwork.ts` (and UI only if the failing behaviour is user-visible), with the test turning green. Rows that pass need no code.

## Acceptance criteria
1. Matrix test committed; every row green.
2. No runtime domain behavior failed; this increment added the missing named assertion coverage without changing the approved workprogram template semantics.
3. `docs/product/gap-analysis.md` rows US-M3-004/005 are ✅ DONE with the test name as evidence.

## Verify with
```bash
npx tsx --test tests/unit/businessWorkspace.test.ts tests/unit/fieldworkGates.test.ts && npm run test:unit && npm run test:e2e
```

`fieldworkAcceptance.test.ts` exports the matrix helper and is registered by `businessWorkspace.test.ts`, because the matrix consumes the shared seeded worker/session fixture. Current evidence: focused BUSINESS workspace matrix 11/11, full unit suite 195 passed / 1 skipped / 0 failed, `npm run cloud:typecheck` passed, and the full E2E suite passed 13/13 before this test-only increment. No runtime domain fix was needed.

## Current verification (2026-10-10)

The registered matrix still passes as part of the focused BUSINESS workspace
test (11/11); the current full unit suite passes 225 tests with 1 opt-in stress
test skipped and 0 failures, and `npm run cloud:typecheck` passes. The gap
analysis rows US-M3-004/005 remain ✅ DONE with the matrix test cited. A current
`npm run test:e2e` attempt does not pass: its first E06-S01/E06-S04 accessibility
case failed after about 56 seconds, then the runner stalled before reporting
diagnostics or later cases and was stopped. This does not fail a matrix row, but
the repository-wide browser verification is open until the shared harness is
repaired and rerun.

## Stop and ask if
A failing row would require changing an existing approved workprogram template's semantics.
