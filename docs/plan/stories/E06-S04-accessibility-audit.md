# E06-S04 — Accessibility audit (WCAG 2.2 AA) and fixes

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E06-S04 | E06 | Quality | P1 | M | E03-S08 | NFR UX-01 |

## Intent
Find and fix serious accessibility defects on the no-auth workspace landing/setup
flow, the self-selected CLIENT portal, and each business module panel. The
product's accepted no-auth profile supersedes the earlier sign-in, password-change
and reset screen targets; do not add authentication screens for this audit.
This scope follows the current epic authority recorded in `docs/product/prd.md`
and the scope correction in `docs/quality/testing.md`.

## Acceptance criteria
1. axe-core (vendored as a single static JS file under `tests/vendor/axe.min.js` with its licence and version noted — **no npm dependency**) injected through the existing CDP harness on: workspace landing, workspace setup dialog, CLIENT portal, and each `Business*Panel` in a populated state, at 1440×900 and 390×844.
2. Zero `critical`/`serious` violations; remaining `moderate` listed with owner decision.
3. Keyboard-only walkthrough of E2E-001 (lead → portal) and client upload recorded (manual, `docs/ops/uat-log.md`).
4. Test `tests/e2e/accessibility.test.ts` fails on any new critical/serious violation.

## Dependency and license
The firm must be able to comply with axe-core's MPL-2.0 and bundled third-party
license notices when distributing the test artifact. This audit does not add
axe-core to the application bundle or runtime dependencies. If firm policy
rejects the MPL-2.0 license, stop before vendoring and select an approved
replacement.

## Manual walkthrough scope
The lead-to-CLIENT-portal journey and client document upload are manual, keyboard-
only acceptance checks. Run them only in a trusted synthetic-data test perimeter;
the public no-auth Worker must not be used for workspace bootstrap or client
evidence. A local test run can support code verification but does not replace
deployed UAT evidence in `docs/ops/uat-log.md`.
