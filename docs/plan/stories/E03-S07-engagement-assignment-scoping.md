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

### Initial main-branch audit (2026-10-09)

`tests/unit/assignmentScopeAudit.test.ts` creates three post-commercial engagements: one assigned only to the Reviewer, one assigned only to the Preparer, and another assigned to the Reviewer for pagination coverage. All assignments end in 2020; both assigned users can still open their engagement workflows. The audit ran against `worker.fetch` before adding S07 enforcement.

| Persona | Assigned control | Unassigned engagement reads | Unassigned engagement commands |
|---|---|---|---|
| Partner (`APPROVER`) | Workflow reads succeeded for both sample engagements. | Firm-wide access remains the control. | Existing Partner command behavior remains the control. |
| Reviewer | Workflow read succeeded for both historical assignment rows. | 12 of 24 engagement read routes returned 200, including workflow, risk, delivery, planning, trial balance, reporting, archive status, PBC portal and planning readiness. Other routes returned 400/403/404/409/422 for unrelated validation, persona, missing-record or lifecycle gates; none consistently returned `FORBIDDEN_SCOPE`. | `staffing.assign` succeeded against an engagement where the reviewer had no assignment and inserted a new assignment plus audit record. |
| Preparer | Workflow read succeeded for the historical assignment row. | 12 of 24 engagement read routes returned 200, including workflow, risk, delivery, planning, trial balance, reporting, archive status, PBC portal and planning readiness. Other routes returned 400/403/404/409/422 for unrelated validation, persona, missing-record or lifecycle gates; none consistently returned `FORBIDDEN_SCOPE`. | `pbc.request.create` succeeded against an engagement where the preparer had no assignment and inserted a PBC request plus audit record. |

The unfiltered client endpoint also returned the Reviewer’s unassigned client on a subsequent page. No direct `lead.read` restriction is inferred from the audit: leads remain commercial records and are visible to personas with the existing lead action. Three tests are marked TODO for the gaps; they will become required passing assertions as implementation lands. This matrix is recorded here because the authorized workflow is direct work on `main`, without a pull request.

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
