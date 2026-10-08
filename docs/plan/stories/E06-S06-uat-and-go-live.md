# E06-S06 — UAT (E2E-001…E2E-005) and go-live runbook

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S06 | E06 | Ops | P0 | M | all other P0/P1 stories | Story doc §11 End-to-End Journeys, §12 negative scenarios, §17 DoD |

## Intent
The firm runs the five end-to-end journeys on staging with real logins and signs off; production is then opened under a written checklist.

## Acceptance criteria
1. `docs/ops/uat-plan.md`: for each of E2E-001…005 and every negative scenario in story-doc §12 — steps, persona (real named staff), expected result, evidence to capture.
2. `docs/ops/uat-log.md` filled by firm testers; every journey Pass, defects linked to fix stories and re-tested.
3. `docs/ops/go-live-checklist.md` with sign-off lines for: NFR P0 rows (with evidence links), retention term confirmed (CMP-02), data-protection review (CMP-03), backup drill (E02-S03), alert fire-drill (E06-S03), repository visibility decision, legacy prototype Worker/D1/R2 decommission plan, first-Partner bootstrap done in production, Entra redirect URIs for production, email sender DNS verified.
4. Production deploy via `workflow_dispatch` with approval; post-deploy smoke: Partner sign-in, client portal sign-in with temp password → change, `/api/health/ready` 200.
5. Rollback procedure documented (previous Worker version + D1 Time Travel bookmark taken immediately before go-live).
