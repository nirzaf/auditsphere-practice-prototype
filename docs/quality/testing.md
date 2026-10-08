# Test Strategy & Definition of Done

## 1. Commands (verified at `54ec5a3`)

| Purpose | Command | Notes |
|---|---|---|
| Install | `npm ci` | Node 24 / npm 11 required (`.nvmrc`). npm is the only package manager. |
| App typecheck ("lint") | `npm run lint` | = `tsc --noEmit` (~3 s) |
| Worker typecheck | `npm run cloud:typecheck` | = `tsc --noEmit -p worker/tsconfig.json` |
| Unit + Worker-integration | `npm run test:unit` | = `tsx --test --test-concurrency=1 tests/unit/*.test.ts`. Baseline: 631 tests, 630 pass, 1 skipped (opt-in 4 GiB stress). Several minutes. |
| One file | `npx tsx --test tests/unit/<file>.test.ts` | Use during a story; run the full suite before done. |
| Filter by name | `npx tsx --test --test-name-pattern="<regex>" tests/unit/<file>.test.ts` | |
| Browser E2E | `npm run test:e2e` | Builds, then drives system Chrome via CDP. Set `CHROME_PATH`. CI uses `/usr/bin/google-chrome`. |
| Production build | `npm run build` | Also regenerates `public/Client_Requirements.html` until E01-S03 removes that step. |
| Local full stack | `npm run dev` | Wrangler local D1/R2 on port 3000; never touches production. |

## 2. Test pyramid

| Layer | What | Where | Harness | Expectation for new work |
|---|---|---|---|---|
| Pure unit | Calculations, parsers, policy functions (password policy, token hashing, milestone defaults, header builders) | `tests/unit/<topic>.test.ts` | `node:test` + `assert/strict` | Every branch, boundary and invalid input. Pattern: `tests/unit/businessPracticeAging.test.ts`. |
| Worker integration | A request through `worker.fetch` against in-process SQLite with **real migrations** | `tests/unit/business*.test.ts`, new `tests/unit/auth*.test.ts` | `tests/helpers/sqliteD1.ts` | Every new route/command: happy path, each guard/error code, idempotent replay, stale `expectedVersion`, cross-scope access, persona denial. Assert DB rows and `audit_events`, not only status codes. |
| Migration | Schema applies cleanly from empty; triggers block forbidden updates/deletes; schema version | `tests/unit/workerMigrations.test.ts` | SQLite | Each new migration: apply test + one trigger test per append-only table + version bump assertion. |
| Browser E2E | Real UI flows in Chrome at 390×844 and 1440×900 | `tests/e2e/business*.test.ts` | `tests/helpers/headlessChrome.ts`, `cdp.ts`, `businessE2eServer.ts` | One journey per user-visible story; screenshot evidence optional. |
| Manual UAT | E2E-001…E2E-005 from the story doc on staging with real logins | `docs/ops/uat-log.md` | Human | Gate for go-live (E06-S06). |

### 2.1 Coverage
No coverage gate exists today. For code added by this backlog under `worker/auth/**` and `src/components/auth/**`: **≥ 90 % line coverage** measured with Node's built-in test coverage (`--experimental-test-coverage`; confirm flag on Node 24 during E03-S01 and record the exact command in `CLAUDE.md`). Do not add a coverage dependency.

### 2.2 Fixtures and seed data
- Synthetic data only. Never commit real client names, emails, TBs or documents.
- Business tests build state through the public API (bootstrap → commands), as `tests/unit/businessWorkspace.test.ts` does. Do not insert business rows with raw SQL except to set up an impossible-via-API negative case, and say so in a comment.
- **[E03-S03]** New helper `tests/helpers/authSession.ts`:
  - `createStaffSession(db, { staffMemberId, persona })` → inserts `user_accounts` + `user_profile_grants` + `auth_sessions` and returns a `Cookie` header value. Allowed to use SQL directly (it is a test credential factory).
  - `loginClient(fetch, email, password)` → exercises the real `/api/auth/client/login`.
  - `oidcFixture()` → local RSA key, JWKS JSON and `signIdToken(claims)` for staff-callback tests; the Worker's JWKS fetch is injected via an env/test seam, never by monkey-patching `fetch` globally.
- Every existing helper that sets `X-Actor-Id` / `X-Active-Persona` migrates to the session helper in E03-S03 (mechanical change; no assertion changes except where the old header was the thing under test).

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
- [ ] `npm run test:e2e` — 0 failures when the story touches UI, routes or auth (otherwise state "not run — no UI/route change").
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
