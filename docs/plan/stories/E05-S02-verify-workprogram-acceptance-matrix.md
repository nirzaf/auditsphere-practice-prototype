# E05-S02 — Verify workprogram and ad-hoc procedure acceptance (VERIFY FIRST)

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
One `it()` per AC, through `worker.fetch` with sessions:
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
2. PR lists rows that failed initially and the fix for each ("none" allowed).
3. `docs/product/gap-analysis.md` rows US-M3-004/005 flipped to ✅ DONE with the test name as evidence.

## Verify with
```bash
npx tsx --test tests/unit/fieldworkAcceptance.test.ts tests/unit/fieldworkGates.test.ts && npm run test:unit && npm run test:e2e
```

## Stop and ask if
A failing row would require changing an existing approved workprogram template's semantics.
