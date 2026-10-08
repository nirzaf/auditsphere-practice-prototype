# E03-S07 — Engagement-assignment access scoping (VERIFY FIRST)

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E03-S07 | E03 | Verify → Feature | P1 | M | E03-S03; decision D3 | §1.2 (Preparer "assigned FSLI"), ISA 220 confidentiality; NFR SEC-11 |

## Intent
Staff should see and act on only the engagements they are assigned to, unless the firm decides otherwise (D3). Today assignment drives readiness checks but not access.

## Read first
- `worker/business.ts` `resolveBusinessContext` (scope logic for `X-Client-Id`/`X-Engagement-Id`)
- `engagement_assignments` (`worker/migrations/0014_staffing_folders.sql` L44+) and its uses in `worker/businessTb.ts` L966–1227, `worker/businessPractice.ts` L283
- List endpoints: `GET …/clients`, `…/leads`, `…/pbc-engagements`, `…/capacity`, `…/practice/*`

## Step 1 — Verify (no code change)
Produce a matrix (persona × endpoint/command family) showing whether an unassigned Preparer/Reviewer can read or mutate another engagement today. Use a Worker-integration test that creates two engagements with disjoint assignments. Commit the test as `tests/unit/assignmentScopeAudit.test.ts` with `todo` markers for current gaps.

## Step 2 — Implement per D3 (default rule if D3 unanswered)
| Persona | Engagement-scoped reads/commands | Firm-level lists |
|---|---|---|
| Partner `APPROVER` | all engagements | all |
| `REVIEWER` | engagements with any assignment row for their staff member (any phase, any dates) | filtered to assigned clients |
| `PREPARER` | same as Reviewer | filtered to assigned clients; leads list visible (commercial work is not engagement-bound) |
| `CLIENT` | unchanged (own client only) | unchanged |
Practice reports (firm TB/P&L/AR ageing, utilisation, profitability) remain Partner/Reviewer per existing `allowedActions` — do not widen.

**Commercial-phase exception (default):** engagements in `LEAD_INGESTION … ADVANCE_BILLING` stay visible to every staff persona that holds the relevant commercial action (`proposal.*`, `lead.*`, `billing.read`), because staff are usually assigned only once planning starts. Scoping applies from `PORTAL_ACTIVE_PLANNING` onward. Confirm with the firm under D3.

## Acceptance criteria
1. Step-1 matrix in the PR description.
2. Unassigned Reviewer/Preparer → `403 FORBIDDEN_SCOPE` on every engagement-scoped read and command (parametrised test over the family list), with no writes.
3. Access is granted by **any** `engagement_assignments` row for that staff member on that engagement, regardless of `start_date`/`end_date` (assignments are phase-scoped capacity bookings with mandatory end dates — verified in `0014_staffing_folders.sql` L44–63 — so date-bounding access would lock reviewers out of their own completed work). Date-bounded access is a D3 option only if the firm explicitly asks for it.
4. Client and lead lists for non-Partners filtered per table; pagination cursors still work (`tests/unit/businessDirectoryPagination.test.ts` extended).
5. Partners unaffected (existing suites green).

## Stop and ask if
- An existing flow requires an unassigned Reviewer to act (e.g. covering for a colleague) — propose an explicit "temporary assignment" rather than a bypass.
