# CLAUDE.md — AuditSphere (STE Audit Management Tool v2.1)

Audit-practice platform for one Qatar audit firm: CRM → acceptance → planning → fieldwork → review → reporting → ISA 230 archive → practice ledger, plus a client PBC portal. **The business workflow is already implemented.** Remaining work is production completion: legacy removal, environments, authentication, live email, a few partials, hardening. Codex: `AGENTS.md` points here.

## Read before working on…
| Topic | Read |
|---|---|
| Anything (scope, non-goals, open decisions) | `docs/product/prd.md` |
| Whether a requirement is already done | `docs/product/gap-analysis.md` — ✅ rows: **do not rebuild** |
| Names for anything | `docs/product/glossary.md` |
| Architecture, stack versions, module map | `docs/architecture/overview.md` |
| Why something is the way it is | `docs/architecture/adr/` |
| Performance/security/compliance targets | `docs/architecture/nfr.md` |
| New tables/migrations | `docs/contracts/data-model-delta.md` + `worker/migrations/` |
| New routes/commands/error codes | `docs/contracts/api-delta.md` |
| Tests, fixtures, Definition of Done | `docs/quality/testing.md` |
| Deleting anything | `docs/plan/removal-guideline.md` |
| What to do next | `docs/plan/roadmap.md`, `docs/plan/epics.md`, your story file |
| Spec source | `docs/product/source/` (after E01-S01; before that `reference/STE_Audit_Management_Tool_Detailed_User_Stories_v2.1.md`) |

## Commands (Node 24, npm 11 — npm only)
```bash
npm ci                       # install from lockfile
npm run lint                 # tsc --noEmit (app)
npm run cloud:typecheck      # tsc -p worker/tsconfig.json
npm run test:unit            # node:test via tsx, serial; baseline 630 pass / 1 skip
npx tsx --test tests/unit/<file>.test.ts                       # one file
npx tsx --test --test-name-pattern="<regex>" tests/unit/<f>.test.ts
npm run build                # production SPA build into dist/
npm run test:e2e             # builds, then Chrome via CDP (set CHROME_PATH)
npm run dev                  # Wrangler local D1/R2 on :3000 (never production)
```

## Layout (what is product vs legacy)
```
worker/                      PRODUCT backend (Cloudflare Worker)
  index.ts                   router + handlers (contains LEGACY TEST-mode handlers until E01-S02)
  business.ts                CRM, directory, proposals, files, context resolution, command dispatcher
  businessRisk|Planning|Tb|Fieldwork|Reporting*|Delivery|Practice|Outbox|Workflow.ts  module logic
  reporting*.ts proposalDocument.ts commercialDocument.ts  document generation
  migrations/NNNN_*.sql      schema (forward-only). 0001/0002/0004/0007 = legacy demo tables; 0003 creates
                             `workspaces`/`audit_events` (shared); 0005 `command_assertions` + 0006+ = business
  emailProvider/             separate email Worker
  integrations/              SharePoint (optional mirror), readiness status
  auth/                      [TARGET E03] authentication
src/components/business/     PRODUCT UI panels (one per module)
src/services/businessWorkspace.ts, src/shared/api/business.ts, src/shared/api/errors.ts   PRODUCT client/contract
tests/unit/business*.test.ts, tests/e2e/business*.test.ts, tests/helpers/sqliteD1.ts      PRODUCT tests
LEGACY (do not read for patterns, do not extend, deleted by E01):
  src/PrototypeApp.tsx  src/store/  src/components/{modules,target,layout,walkthrough,clientRequirements}/
  most of src/services/ and src/domain/  worker/{sessions,state,files}.ts  ste-audit/  tracking/  reference/*
```

## Patterns — mirror exactly one reference per pattern
| Pattern | Reference file |
|---|---|
| New business command (zod strict payload → builder returns `D1PreparedStatement[]`) | `worker/businessPlanning.ts` (`milestone.set` schema L38, `isBusinessPlanningCommand` L49, `buildBusinessPlanningMutation` L174) |
| Read endpoint (`GET …/<x>-workspace`) | `worker/businessPlanning.ts` `getBusinessPlanningWorkspace` + its handler in `worker/index.ts` |
| Partner/Reviewer guard helpers | `worker/businessReporting.ts` L56–57 (`partner()`, `reviewer()`) |
| Async work | `worker/businessOutbox.ts` (enqueue `outbox_jobs`, process in `scheduled()`) |
| Migration with append-only triggers | `worker/migrations/0006_business_foundation.sql` L283–304; CHECK change via table rebuild: `0019_external_confirmations.sql` L8–34 |
| Schema version bump | `worker/migrations/0044_mapping_name_suggestions.sql` (UPDATE `application_schema_version`) + `worker/versions.ts` constant + `tests/unit/workerMigrations.test.ts` |
| Pure unit test | `tests/unit/businessPracticeAging.test.ts` |
| Worker integration test | `tests/unit/businessWorkspace.test.ts` (`worker.fetch` + `SqliteD1`) |
| UI panel | `src/components/business/BusinessPlanningPanel.tsx` |
| Shared types for UI | `src/shared/api/business.ts` |

## Conventions
- Mutations **only** via `POST /api/workspaces/:id/commands` + `Idempotency-Key` (ADR-0004). One command = one `env.DB.batch`. Auth endpoints (E03) are the only new non-command mutating routes.
- Every table: `workspace_id`, `UNIQUE(workspace_id,id)`, composite FKs `ON DELETE RESTRICT`; mutable rows have `version` and are updated with `WHERE version=?`.
- Money: integer QAR minor units (`*_minor`), BigInt for arithmetic, strings over the wire when large; rates in `*_bps`. Dates `YYYY-MM-DD` in Asia/Qatar; timestamps ISO UTC (ADR-0009).
- Errors: throw `ApiError(code, message, details?)` with a code from `src/shared/api/errors.ts`; add new codes there first.
- Names: glossary code terms; tables plural snake_case; commands `entity.verb`.
- Inject `now`; never `Date.now()` inside domain logic or assertions.
- New files ≤ 800 lines. Do not grow `worker/business.ts` (≈4k lines) — put new domains in new modules.

## Hard guardrails
- **Never** add a dependency, framework, ORM, test runner or browser tool without explicit approval in the story.
- **Never** edit an applied migration; never run `wrangler d1 migrations apply --remote`, `wrangler deploy`, `wrangler secret put` or anything against staging/production unless the story says so and the user confirms in-session.
- **Never** move business logic into the browser or trust a header/body for identity.
- **Never** weaken an existing guard (`SELF_APPROVAL`, `SELF_REVIEW_BLOCKED`, Partner-only actions, RED Manager execution, portal freeze, archive seal) to make a test pass.
- **Never** log or persist passwords, tokens, file bytes, or full personal emails.
- **Never** rebuild a ✅ row of `docs/product/gap-analysis.md`.
- **Never** extend or copy legacy code (see Layout). If legacy code is the only implementation of something you need, stop and ask.
- Do not touch `ste-audit/`, `public/templates/`, `worker/r2-archive-locks.json` unless the story says so.

## Definition of Done (full list: `docs/quality/testing.md` §3)
ACs met and mapped to tests · lint + worker typecheck clean · unit green (skip count unchanged) · build green · e2e green if UI/routes/auth touched · migration numbered/forward-only/version-bumped/tested · no new deps · no secrets/real data · contracts + glossary + docs updated · `git diff --check` clean · report: changes, assumptions, deviations, questions, follow-ups.

## Working protocol
1. Read this file, your story, and only the docs the story lists.
2. For **Verify → Fix** stories, write the failing test first and report before fixing if the story says "Step 1 only".
3. Small commits; message `type(scope): summary` (e.g. `feat(auth): add session primitives`).
4. If an AC conflicts with the code or another doc: stop, quote both, ask.
5. After a milestone: propose updates to this file and the ADRs for anything you got wrong.
