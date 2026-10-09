# AuditSphere contributor guide

This is a Cloudflare Worker application with a React BUSINESS workspace. The implementation backlog is in `docs/plan/roadmap.md`; stories and their acceptance criteria are in `docs/plan/stories/`.

## Read before changing code

- Product scope and current gaps: `docs/product/prd.md`, `docs/product/gap-analysis.md`
- Terms: `docs/product/glossary.md`
- Architecture and decisions: `docs/architecture/overview.md`, `docs/architecture/adr/`
- API and database changes: `docs/contracts/api-delta.md`, `docs/contracts/data-model-delta.md`
- Test strategy and definition of done: `docs/quality/testing.md`
- Removal safety: `docs/plan/removal-guideline.md`
- Operations: `docs/ops/runbook.md`, `docs/ops/integrations.md`

## Commands

Use Node.js 24 and npm 11. npm is the only package manager.

```sh
npm ci
npm run lint
npm run cloud:typecheck
npm run test:unit
npm run test:e2e
npm run build
npm run dev
```

`npm run dev` serves the UI and API using Wrangler's local D1/R2 emulators. It does not deploy to a remote environment. Set `CHROME_PATH` to the installed Chrome executable before running browser E2E tests on Windows.

## Code and data boundaries

- The active browser application is `src/App.tsx` and `src/components/business/`.
- Shared browser API types are in `src/shared/api/business.ts`; API error codes are in `src/shared/api/errors.ts`.
- Worker routing starts in `worker/index.ts`; business logic is split among `worker/business*.ts` modules.
- SQL schema history is forward-only in `worker/migrations/`. Never edit an applied migration.
- D1 is authoritative for business records. R2 contains committed file bytes. Do not move business rules into the browser or trust a caller-provided identity.
- Use synthetic test data. Never commit client personal data, passwords, tokens, file contents, or secrets.

## Implementation rules

- Follow the story acceptance criteria and update contracts, glossary, tests, and operational docs when behavior changes.
- Do not add dependencies, weaken authorization or lifecycle guards, or rebuild requirements already marked complete in `docs/product/gap-analysis.md`.
- Use small commits with messages such as `feat(auth): add staff session primitives`.
- Do not run remote migrations, deploys, or secret updates unless the active story calls for the exact action and the user confirms it in-session.
- If acceptance criteria conflict with existing code or another contract, stop and report the conflicting requirements before changing behavior.
