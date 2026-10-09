# Test Strategy & Definition of Done

> **Scope correction:** this strategy contains historical E03 login/session test plans. The current real-implementation epic has no application authentication. Use self-selected persona fixtures and test workflow restrictions without claiming identity assurance; do not add auth-session helpers or login/OIDC tests for this scope.

## 1. Commands (checked 2026-10-09)

| Purpose | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 24 / npm 11 required (`.nvmrc`). npm is the only package manager. |
| App typecheck ("lint") | `npm run lint` | = `tsc --noEmit` (~3 s) |
| Worker typecheck | `npm run cloud:typecheck` | = `tsc --noEmit -p worker/tsconfig.json` |
| Unit + Worker-integration | `npm run test:unit` | = `tsx --test --test-concurrency=1 tests/unit/*.test.ts`. Current run: 177 tests, 176 pass, 1 skipped (opt-in stress), 0 failed. |
| One file | `npx tsx --test tests/unit/<file>.test.ts` | Use during a story; run the full suite before done. |
| Filter by name | `npx tsx --test --test-name-pattern="<regex>" tests/unit/<file>.test.ts` | |
| Browser E2E | `npm run test:e2e` | Builds, then drives system Chrome via CDP. Set `CHROME_PATH`. CI uses `/usr/bin/google-chrome`. |
| Production build | `npm run build` | Also regenerates `public/Client_Requirements.html` until E01-S03 removes that step. |
| Local full stack | `npm run dev` | Wrangler local D1/R2 on port 3000; never touches production. |

## 2. Test pyramid

| Layer | What | Where | Harness | Expectation for new work |
|---|---|---|---|---|
| Pure unit | Calculations, parsers, milestone defaults, header builders | `tests/unit/<topic>.test.ts` | `node:test` + `assert/strict` | Every branch, boundary and invalid input. Pattern: `tests/unit/businessPracticeAging.test.ts`. |
| Worker integration | A request through `worker.fetch` against in-process SQLite with **real migrations** | `tests/unit/business*.test.ts`, `tests/unit/publicLeadIntake.test.ts` | `tests/helpers/sqliteD1.ts` | Every new route/command: happy path, each guard/error code, idempotent replay, stale `expectedVersion`, cross-scope access, persona denial. Assert DB rows and `audit_events`, not only status codes. |
| Migration | Schema applies cleanly from empty; triggers block forbidden updates/deletes; schema version | `tests/unit/workerMigrations.test.ts` | SQLite | Each new migration: apply test + one trigger test per append-only table + version bump assertion. |
| Browser E2E | Real UI flows in Chrome at 390×844 and 1440×900 | `tests/e2e/business*.test.ts` | `tests/helpers/headlessChrome.ts`, `cdp.ts`, `businessE2eServer.ts` | One journey per user-visible story; screenshot evidence optional. |
| Manual UAT | Epic lifecycle journeys on a trusted isolated environment using the four workflow personas | `docs/ops/uat-log.md` | Human | Requires evidence and firm sign-off; persona switching is not identity verification. |

### 2.1 Coverage
No coverage gate exists today. Do not add authentication/session code under this epic.

### 2.2 Fixtures and seed data
- Synthetic data only. Never commit real client names, emails, TBs or documents.
- Business tests build state through the public API (bootstrap → commands), as `tests/unit/businessWorkspace.test.ts` does. Do not insert business rows with raw SQL except to set up an impossible-via-API negative case, and say so in a comment.
- Persona/actor helpers intentionally pass self-selected workflow context. Tests must label this as non-authenticated and must never assert that a persona header proves real identity.

### 2.3 Flakiness rules
- Inject time (`now`) — never `Date.now()` in assertions.
- `--test-concurrency=1` stays; do not parallelise suites sharing a SQLite file.
- E2E waits on DOM state, never fixed sleeps > 250 ms.

## 3. Definition of Done (checklist the agent must report on)

A story is **done** only when every applicable item is ticked in the agent's final report:

- [ ] All acceptance criteria in the story file demonstrably met; each AC mapped to a test name or a recorded manual check.
- [ ] `npm run lint` — 0 errors.
- [ ] `npm run cloud:typecheck` — 0 errors.
- [ ] `npm run test:unit` — 0 failures; skipped count unchanged (1) unless the story retires tests, in which case the removed tests are listed.
- [ ] `npm run build` — succeeds.
- [ ] `npm run test:e2e` — 0 failures when the story touches UI or routes (otherwise state "not run — no UI/route change").
- [ ] New migration: numbered next in sequence, forward-only, schema version bumped (SQL + `worker/versions.ts`), migration test added, append-only triggers tested. No edits to applied migrations.
- [ ] No new runtime or dev dependency (or the story explicitly allowed it and `package-lock.json` is updated with an exact pin).
- [ ] No secrets, real personal data or credentials in code, tests, fixtures or logs.
- [ ] Contracts updated: zod schema, `src/shared/api/*` types, `docs/contracts/*` if the shape changed; glossary updated for any new term.
- [ ] Docs that describe changed behaviour updated (`README.md`, `CLAUDE.md` commands, runbooks). Deleted features removed from docs — stale docs are bugs.
- [ ] `git diff --check` clean; no unrelated file changes.
- [ ] Report: summary of changes, files touched, assumptions, deviations from the story/contract, open questions, follow-up stories proposed.

## 4. Regression baseline to protect

These suites encode completed spec behaviour; they must stay green through every story (paths at `54ec5a3`):
`businessWorkspace`, `businessReportingDelivery`, `businessReportingOpinion`, `businessReportingProvenance`, `businessPracticeAging`, `businessTbWorkbook`, `businessCommandConcurrency`, `businessArchiveExport`, `businessArchiveDownload`, `archiveRetention`, `archiveDownloadTickets`, `streamingArchive`, `fieldworkGates`, `materialityBenchmark`, `goingConcernStandards`, `statementVariance`, `practiceAccounts`, `proposalDocument`, `reporting*`, `emailProvider`, `integrationStatus`, `sharePointAdapter`, `workerMigrations`, `workerObservability`, and `tests/e2e/business*.test.ts`.

Legacy suites retired by E01 are listed in `docs/plan/removal-guideline.md` §4.
