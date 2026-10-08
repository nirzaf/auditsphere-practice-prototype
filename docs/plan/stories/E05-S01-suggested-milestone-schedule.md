# E05-S01 — (Optional, P2) Suggested milestone schedule from period end

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E05-S01 | E05 Functional completion | Feature | P2 (optional) | S | M3 | §4.2.2 "Configure operational milestones relative to statutory cutoffs"; US-M2-006 |

## Intent
Save Managers typing: offer a pre-filled, editable milestone schedule derived from the engagement period end. **US-M2-006's acceptance criteria are already met by manual `milestone.set`** — this is a convenience and must not make the example dates mandatory.

## Read first
- `worker/businessPlanning.ts` (`milestone.set`, L~40), `milestones` table (`0014_staffing_folders.sql` L100–120: codes `FIELDWORK_START, DRAFT_REPORT, FINAL_REPORT, STATUTORY_CUTOFF`, `source_reference` required)
- `src/components/business/BusinessPlanningPanel.tsx`

## Default rule (firm may change; store as code constants in `worker/businessPlanning.ts`, not DB)
For period end `P` (Asia/Qatar date):
- `FIELDWORK_START` = first Sunday on/after `P + 1 day` (Qatar work week starts Sunday — confirm with firm; spec example says "January Week 1")
- `DRAFT_REPORT` = `P + 46 days` (31 Dec → 15 Feb)
- `FINAL_REPORT` = `P + 74 days` (31 Dec → 15 Mar in non-leap years; document leap-year behaviour)
- `STATUTORY_CUTOFF` = not suggested (must be entered from the client's regulatory deadline)

## Acceptance criteria
1. Command `milestone.applyDefaults` (api-delta §3) computes the three suggestions; with `overwrite:false` it fills only missing codes; `source_reference` = `"Suggested from period end <P> (default rule v1)"`.
2. Pure function `suggestMilestones(periodEnd)` unit-tested for 31 Dec, 30 Jun, 31 Mar, leap-year 29 Feb period ends, and month-end clamping.
3. UI: "Suggest dates" button pre-fills the milestone form; nothing is saved until the user submits; saved values remain fully editable.
4. No change to existing milestone validation or approvals.

## Verify with
```bash
npx tsx --test tests/unit/milestoneDefaults.test.ts && npm run test:unit && npm run test:e2e
```

## Implementation progress — 2026-10-08
- Added `suggestMilestones(periodEnd)` using UTC calendar-day arithmetic: first Sunday after period end, +46 days, and +74 days. This avoids locale/DST drift and does not invent a statutory cutoff.
- Added `milestone.applyDefaults`; it checks the period end against the engagement, applies only missing dates by default, preserves existing values, and refuses report dates without a cutoff or beyond that cutoff. Explicit user edits can be submitted with the schedule.
- The planning UI now has a “Suggest dates” control and editable date inputs. Suggesting is client-side only; saving requires the separate submit action.
- Added date-boundary tests and API command coverage in `tests/unit/milestoneDefaults.test.ts` and `tests/unit/businessWorkspace.test.ts`.
- Verification: `npm run build` and `npm run cloud:typecheck` passed; targeted `milestoneDefaults` and `businessWorkspace` unit cases passed 5/5; the targeted E05-S01 browser acceptance passed (1/1) against the local harness.
- Cutoff behavior: the command preserves existing report-milestone validation. Draft and final suggestions are skipped until a firm-supplied statutory cutoff is recorded; the UI reports those skipped dates and never invents a cutoff.
- Status: **implemented; targeted acceptance verified**.

## Stop and ask if
The firm's working-week or default offsets differ from the rule above.
