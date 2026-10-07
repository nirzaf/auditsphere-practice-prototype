# AuditSphere · Business workspace

AuditSphere is a server-backed audit practice workspace spanning Commercial & CRM, Governance & Planning, Technical Fieldwork, Reporting & Archive, and Practice Management. The Cloudflare Worker serves the app and API on one origin; D1 holds business records and R2 holds committed file bytes. The browser retains the selected workspace and persona, not business records.

Persona selection is self-asserted and does not verify identity. Use a trusted, access-controlled environment before entering confidential client data. Firm-supplied policy, identity, legal, and professional approvals remain required before production use.

## Run and verify

```sh
npm ci
npm run dev
npm run lint
npm run test:unit
npm run test:e2e
npm run cloud:typecheck
npm run build
```

npm is the only package manager here: `package-lock.json` is the single lockfile. Node 24 is pinned by `.nvmrc` and declared in `package.json` `engines`. `npm run dev` builds the UI and serves it through Wrangler with local D1/R2 emulators on port 3000; it does not use production Cloudflare credentials. `npm run preview` serves the existing `dist/` build through the same Worker. On Windows, set `CHROME_PATH` to the installed Chrome executable before browser tests. The build also generates `public/Client_Requirements.html` from the shared requirements presentation data.

## Architecture

```text
        AuditSphere React application
                        |
          Cloudflare Worker + Static Assets
                        |
                     /api/*
                  _____|_____
                 |           |
                D1          R2
      structured state   exact file bytes
```

- **One Cloudflare Worker** (`wrangler.jsonc` → `worker/index.ts`) serves built Static Assets and the JSON API under `/api/*` on the same origin. D1 is authoritative for structured workspace records; R2 stores committed file bytes with SHA-256 verification.
- **Workspace sessions** use same-origin server-managed session cookies. The browser does not hold a Bearer workspace token or a whole-state save payload.
- **Command-based API**: the browser posts the shared typed command union (`src/shared/api/commands.ts`), and the Worker applies commands through the browser-free domain layer (`src/domain/`).
- **Local business development** uses Wrangler's local D1/R2 emulators. It exercises the Worker-backed app without connecting to production Cloudflare resources.
- **Legacy prototype UI** is retained only for its explicitly enabled, isolated E2E harness (`VITE_TEST_HARNESS=true`); ordinary development and preview use the Worker-backed business workspace.

## Current implementation

- `src/components/business/BusinessWorkspace.tsx` renders the Worker-backed business workspace and its create/connect flow.
- `src/services/businessWorkspace.ts` manages the selected workspace and persona in the browser while business records remain server-persisted.
- `src/shared/api/commands.ts` defines typed business commands; `src/domain/` contains shared domain validation and transitions.
- `worker/` implements the API, migrations, D1 transactions, R2 file commits, and lifecycle operations.
- `tests/e2e/` covers Worker-backed business workflows; the legacy browser-store suite opts into its harness explicitly.

## Review resolution and evidence

[Current requirements review resolution](docs/prototype/requirements-review-resolution.md) maps R01–R16 and A01–A15 to implemented behavior and current execution evidence. [Legacy/lifecycle review resolution](docs/prototype/legacy-lifecycle-review-resolution.md) preserves the earlier F01–F22 mapping. [Target lifecycle implementation](docs/prototype/target-lifecycle-report.md), [browser rehearsal](docs/prototype/target-lifecycle-demo.md), [cloud workspace setup](docs/prototype/cloud-demo.md) and the [full-stack architecture](docs/prototype/cloud-full-stack-architecture.md) docs provide supporting context. Formal client sign-off and production professional controls remain separate from executed prototype checks.

Legacy browser-store migrations and personas remain test fixtures only. They are not used as business workspace storage or production authorization.

The legacy prototype's synthetic personas and Superuser are test fixtures only; they do not provide production authorization.
