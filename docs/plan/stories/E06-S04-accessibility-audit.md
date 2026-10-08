# E06-S04 — Accessibility audit (WCAG 2.2 AA) and fixes

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S04 | E06 | Quality | P1 | M | E03-S08 | NFR UX-01 |

## Intent
Find and fix serious accessibility defects on auth pages, the client portal and each module panel.

## Acceptance criteria
1. axe-core (vendored as a single static JS file under `tests/vendor/axe.min.js` with its licence and version noted — **no npm dependency**) injected through the existing CDP harness on: sign-in, change password, reset, portal, each `Business*Panel` in a populated state, at 1440 and 390 px.
2. Zero `critical`/`serious` violations; remaining `moderate` listed with owner decision.
3. Keyboard-only walkthrough of E2E-001 (lead → portal) and client upload recorded (manual, `docs/ops/uat-log.md`).
4. Test `tests/e2e/accessibility.test.ts` fails on any new critical/serious violation.

## Stop and ask if
Vendoring axe-core's licence (MPL-2.0) is not acceptable to the firm.
