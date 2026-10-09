# AuditSphere

AuditSphere is a server-backed audit practice workspace for commercial, audit planning, fieldwork, reporting, archive, and practice operations. The React application and API are served from one Cloudflare Worker. D1 stores structured business records; R2 stores committed file bytes.

The repository includes an authenticated BUSINESS workspace and Worker-backed audit workflows. Firm staff sign in with Microsoft Entra ID, client portal users sign in with provisioned credentials, and the active profile is restricted to access granted to that account. Use synthetic data until the remaining security and go-live gates are complete.

## Run locally

Requirements: Node.js 24 and npm 11. npm is the only package manager; `package-lock.json` is authoritative.

```sh
npm ci
npm run dev
```

`npm run dev` builds the SPA and starts Wrangler with local D1 and R2 emulators. It does not deploy or connect to production resources.

## Verify changes

```sh
npm run lint
npm run cloud:typecheck
npm run test:unit
npm run test:e2e
npm run build
```

## Architecture

```text
React BUSINESS workspace
          │ same-origin /api/*
Cloudflare Worker ── Static Assets
       ├── D1: structured records
       └── R2: committed file bytes
```

- The UI is in `src/components/business/` and uses shared API types from `src/shared/api/business.ts`.
- The Worker routes requests in `worker/index.ts`; business commands and read models are split across `worker/business*.ts` modules.
- Forward-only D1 migrations are in `worker/migrations/`.
- Local and CI checks are described in `docs/quality/testing.md`.

## Project docs

- Product scope: `docs/product/prd.md`, `docs/product/gap-analysis.md`, `docs/product/glossary.md`
- Architecture and decisions: `docs/architecture/overview.md`, `docs/architecture/adr/`
- API and data contracts: `docs/contracts/api-delta.md`, `docs/contracts/data-model-delta.md`
- Implementation plan: `docs/plan/roadmap.md`, `docs/plan/epics.md`, `docs/plan/stories/`
- Operations and integrations: `docs/ops/runbook.md`, `docs/ops/integrations.md`
- Verification: `docs/quality/testing.md`
