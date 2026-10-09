# E06-S06 — UAT (E2E-001…E2E-005) and go-live runbook

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S06 | E06 | Ops | P0 | M | all other P0/P1 stories | Story doc §11 End-to-End Journeys, §12 negative scenarios, §17 DoD |

## Intent
Prepare UAT and release controls for the five end-to-end journeys. The current real-implementation profile has no application authentication; workflow persona selection is caller supplied and must never be represented as a real login. A production release remains closed until staging, governance, and human sign-off gates are satisfied.

## Acceptance criteria
1. `docs/ops/uat-plan.md`: for each of E2E-001…005 and every negative scenario in source-story §12 — steps, synthetic workflow persona, expected result, and evidence to capture. Named operators and approvals are filled by the firm; no credentials are stored.
2. `docs/ops/uat-log.md` filled by firm testers against isolated staging; every journey Pass, defects linked to fix stories and re-tested. A prepared plan is not UAT evidence.
3. `docs/ops/go-live-checklist.md` with owner/evidence/sign-off lines for P0 NFRs, CMP-02 retention, CMP-03 data protection, E02-S03 backup drill, E06-S03 alert drill, repository visibility, legacy resource retirement plan, email sender and verified staging delivery, SharePoint site check, readiness, and rollback bookmark. Historical identity/OIDC sign-offs require an explicit scope reconciliation; they are not silently treated as completed.
4. Production deploy via approved `workflow_dispatch` and post-deploy smoke are **not authorized by this preparation story**. They remain blocked until the release checklist is signed and the explicit no-auth trust boundary is accepted; do not test Partner/client login or temporary-password flows in this product profile.
5. Rollback procedure documents the previous Worker version, immediate pre-deploy D1 Time Travel bookmark, and data-loss implications of restoring it.

## Preparation result

The UAT plan and go-live checklist are prepared. Acceptance is **partial**: staging
resources are blocked on the SP-04 residency/transfer decision, there is no trusted
staging perimeter, required UAT journeys and alert/backup drills are unrun, email
delivery and SharePoint credentials remain unverified, and the current production
Worker is public with no application authentication. No production deploy was
performed. See the current execution record in `docs/ops/uat-log.md`.
