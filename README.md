# AuditSphere · Target audit lifecycle

AuditSphere is a source-grounded, browser-only visualization of the 14 roles in STE-PRD-001, plus one reserved synthetic testing identity (`Superuser · Full Prototype Access`) that exists only to exercise every module from a single tab. It uses synthetic data only; there is no backend, live provider connection, authentication, or production authorization boundary.

## Current lifecycle

Lead → Proposal/EL → 50% advance/receipt → Partner acceptance → M365/PBC → Planning/Staffing → TB/P&L/BS → Fieldwork/Sampling/Confirmations → Preparer/Manager review → SRM/Partner → Opinion/ML/LOR/Report → Balance invoice → 60-day freeze/archive → Practice analytics/firm ledger.

[Implementation report](docs/prototype/target-lifecycle-report.md) · [Rehearsal and evidence](docs/prototype/target-lifecycle-demo.md). Standalone overlapping 39-module surfaces are retired; historical primitive source and contracts remain for regression coverage.

## React + TypeScript + Vite

Install dependencies and start the development server:

```bash
npm install
npm run dev
```

Create a production build with:

```bash
npm run build
npm run preview
```

The production build is written to `dist/` (see `vite.config.ts` `build.outDir`). `deploy.sh` builds and deploys this output.

## Application architecture

The app is a native React + TypeScript single-page application; there is no legacy bridge in the runtime.

- `src/main.tsx`: native React entrypoint; renders `<App />` in `React.StrictMode`.
- `src/App.tsx`: route state, store subscription (with unsubscribe on unmount), modal focus trap and unsaved-form transition guard.
- `src/store/prototypeStore.ts`: the single state authority (`prototypeStore`), with versioned localStorage persistence, storage-conflict guidance and role-scope guards.
- `src/services/guards.ts`: the shared role, scope and segregation-of-duties policy used by store commands and UI affordances alike (`canOpenRoute`, `visibleClientIds`, `visibleEngagementIds`, `requireIndependentActor`, `hasAnyRole`). Reserved-testing overrides are recorded here, never applied silently.
- `src/services/legacyRoutes.ts`: redirects historical hash links to current React routes; role checks still apply and denied destinations resolve to an allowed workspace.
- `src/components/layout/Shell.tsx`: navigation shell, search and scenario controls.
- `src/components/modules/*.tsx`: retained reusable modules; current lifecycle views are in `src/components/target`.
- `src/components/common/*.tsx`: shared presentational pieces — icon set, internal-notes panel, `StatusBadge`, `Feedback` (notices, empty/no-result/out-of-scope states, stale banners, gate lists, action reasons), `Lifecycle` (stepper and panel), `ActivityTimeline` and the collapsed module lifecycle guide.
- `src/services/statusSemantics.ts`, `lifecycles.ts`, `workQueues.ts`, `reviewDiff.ts`, `terminalActions.ts`, `routeCatalog.ts`: presentation-layer projections of existing state (status vocabulary, lifecycle definitions grounded in store commands, scoped role queues, deterministic "changed since last review", terminal-action consequences, breadcrumb catalogue). They never decide eligibility — guards and store commands remain the authority.
- `src/enterprise.css`: the enterprise UX layer stylesheet (loaded after `styles.css`, `roles.css`, `host.css`).
- `src/services/*.ts`: guards, migrations, artifact/IndexedDB storage, exports, calculations.
- `styles.css` / `roles.css`: responsive visual system, imported by Vite.
- `roles.json` / `permissions.json` / `source.json`: synthetic source and role fixtures for the historical bundle — `build.py` validates them and embeds them in `legacy/index.html`. The Vite app does not read them; its personas, grants and records come from `src/store/initialState.ts`, and route/role policy comes from `src/services/guards.ts`.

## Client file-request workflow

Auditors and accountants can create a client-facing file request from `Documents & PBC`. Each request captures a description, due date, recipient, simulated email preview, portal link, shared-file metadata, and a two-sided conversation timeline. Client administrator, finance contributor, and authorized signatory views expose the same request thread within their permitted client scope; the finance contributor can upload or replace a built-in synthetic sample through the portal and the engagement team can reply or review it.

Because this remains a browser-only prototype, email delivery is represented as a local preview and no external email is sent. No document bytes leave the browser; selected PBC uploads and generated artifacts persist only in this browser's local IndexedDB storage as described below, while registered library-document and evidence originals stay in-session.

## Legacy compatibility build (historical)

The original dependency-free HTML build is retained for comparison or rollback only; the Vite app does not load it:

```bash
py -3 build.py
```

It regenerates `app.bundle.js` and writes the standalone artifact to `legacy/index.html`; it does not touch the Vite entrypoint. Validate the compatibility bundle with:

```bash
npm run legacy:check
```

## Scope and limitations

All synthetic state is inspectable in the browser and saved only in local storage when available. Browser-local storage classes exist and are not equivalent:

- **Client PBC response uploads:** the selected bytes are persisted through the local artifact store (`IndexedDB`, labelled `PBC`) and replacement bytes and digests are re-verified after reload.
- **Registered library documents and workpaper evidence attachments:** metadata plus a SHA-256 digest only; the original bytes stay in-session (source is labelled `Local In-Session`) and must be reselected after a reload. They are never advertised as downloadable originals.
- **Generated artifacts (financial packages, exports):** the exact generated bytes are persisted in IndexedDB (`ste-auditsphere-generated-artifacts`) and re-verified against their recorded size, type and SHA-256 on every load.

The visualization does not implement production authentication, enforceable multi-user authorization, real Microsoft integrations, legal signatures, ledger postings, payments, filings, or immutable retention.

The `superuser` persona is a presenter/test tool, not a fifteenth product role. It opens every supported route and sees every synthetic client, engagement and group, and it may perform actor-restricted actions (for example reviewing a journal it prepared) — each such action appends a `Prototype Superuser Override` entry to the local event log and is labelled by the on-screen banner. Data validation, client-portal disclosure filters and revision staleness rules are unchanged for it, so boundary demonstrations must use the ordinary personas. It is seeded in every scenario preset and is added to older stored state by the schema v28 upgrade; demo-identity administration offers only the 14 product roles, and the store rejects an attempt to create a second one.

Enterprise UX layer: shared status semantics, lifecycle panels, stale banners, work queues and the page anatomy are documented in `docs/prototype/design-system.md`; the per-record lifecycles are generated into `docs/prototype/lifecycle-matrix.md` (`npx tsx tools/lifecycle-matrix.ts`) from `src/services/lifecycles.ts`, and the 39-module review is `docs/prototype/enterprise-ux-audit.md`.

Current supported scope, exclusions and historical-source labelling: `docs/prototype/scope.md`. Inspected baseline inventory: `docs/prototype/baseline.md`. 39-module route/command/test map: `docs/prototype/module-coverage.md`. Presenter scenarios with fixed arithmetic: `docs/prototype/demo-scenarios.md`. Actually executed checks (never claimed in advance): `docs/prototype/verification.md`.

## Verification (VP-063)

```bash
npm ci
npm run build
npm run legacy:check
npm run test:unit   # deterministic calculations, guards, migrations, scope scan, TB parsing, export formats
npm run test:e2e    # builds production output, runs Chrome command journey and rendered checkpoints
# macOS: Google Chrome in /Applications is detected automatically; elsewhere set CHROME_PATH.
# The harness pins a 1440x1000 window so every platform starts in the desktop layout.
```

## Optional cloud demo persistence

Presenter / Demo Controls now offers isolated, seeded D1 workspaces backed by a Cloudflare Worker. Start a synthetic commercial pipeline, autosave record changes, and resume with an access code. Workspaces expire after seven days; uploaded/generated file bytes remain browser-local. This is demo snapshot persistence, not production authentication or server-side professional workflow enforcement. Setup, resources and executed evidence: [cloud demo](docs/prototype/cloud-demo.md).

Microsoft 365 screens are local simulations (`liveConnected: false`); SharePoint is the canonical demo library, OneDrive import is optional and disabled by default, mail outcomes are simulated accepted/failed/unknown, and Microsoft Purview is not part of this product. Issued invoices, approvals and releases change local demo records only — no payment demand, signature, email delivery or external retention is performed.
