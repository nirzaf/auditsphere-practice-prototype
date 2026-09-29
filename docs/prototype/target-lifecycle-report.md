# Target lifecycle implementation report

## Implemented

The existing React/Vite prototype now has a canonical 19-stage audit lifecycle over the same `prototypeStore`, role/scope guards and artifact store. The current scenario starts clean. Commercial and professional decisions remain separate; later commands check current prerequisites and source revisions.

- Accepted Proposal/EL revision and fee pin; manually recorded advances; current official receipt PDF; final balance invoice from accepted fee less recognized advance; explicit advance reversal history.
- Exact engagement/year/service acceptance case, five evidence-backed checks, independent assigned Partner decision, conditions/decline/payment gates.
- Five-folder simulated M365 workspace, access verification, scoped PBC handoff, simulated first-login password change/delegation, actual browser file bytes and independent accepted evidence.
- Source-pinned PM/TE/SAD planning, independent plan review, four-role scheduling, budget hours and explicit charge/cost rates. Approved time retains scheduling rate snapshots; missing rates stay Unknown.
- Balanced CSV/genuine Excel TB intake, preserved source history, explicit FSLI mapping, P&L/BS snapshot, approved earlier client-period comparatives and linked program drill-down.
- Six fieldwork areas including Analytical Review and Going Concern, ad-hoc procedure insertion, work/evidence/conclusions, actual XLSX workpaper revisions, reproducible Random/Stratified/systematic MUS sampling and structured X-1/box evidence.
- Scoped confirmation state transitions and independently cleared current response evidence. Critical unresolved/no-response/exception/cancelled matters block final reporting; holding letters remain non-final.
- Preparer ready → Manager return → revised response/workbook → current independent clearance → SRM PDF → assigned Partner clearance. Material source changes stale downstream reviews; migration-added empty histories do not.
- Explicit Clean/Qualified/Disclaimer/Adverse opinion; modified basis/focus validation; genuine illustrative ML/LOR/Audit Report PDFs; simulated delivery; report-date +60 countdown, verified archive copies and frozen-write rejection including superuser.
- Scoped practice hours/WIP/cost/ratio reporting and a separate balanced firm expense ledger with firm TB CSV export.

## Navigation and historical cleanup

The current sidebar follows the target flow. Standalone jobs/templates, communications, budgets/time, receivables, accounting setup/GL/mappings/reconciliations, consolidation, generic financial packages and EQR surfaces are retired or redirected to their corresponding current stages. Their unreachable view imports were removed from the application bundle. The former 39-module browser suite is preserved under `tests/historical`, outside current acceptance. Historical store primitives, fixture data and unit contracts remain for regression coverage; historical documents are explicitly labelled as such.

Current implementation files: `src/services/targetLifecycle.ts`, `src/store/targetLifecycleCommands.ts`, `src/store/targetScenario.ts`, `src/types/targetLifecycle.ts`, `src/components/target/`. Store, guards, schema-30 migration, App/Shell navigation, reused planning/program/time views and TB wizard were integrated. Current master/module/playbook/role references link to the target rehearsal.

## Verified

Executed on the implementation working tree based on `main@716cacf20debb33a64314ffd174f784fe5ade1c9`:

| Check | Executed result |
| --- | --- |
| `npm ci` | Passed |
| `npm run lint` | Passed |
| `npm run test:unit` | 353 passed, 0 failed |
| `npm run test:e2e` with macOS Google Chrome | 2 passed, 0 failed; includes production build |
| `npm run build` | Passed; also rebuilt by deployment script |
| `npm run legacy:check` | Passed |
| `git diff --check` | Passed |

The Chrome command journey executes every requested lifecycle handoff, the return/revision loop, actual artifact persistence/hash verification, 59-day negative/60-day freeze, reload, current SRM migration readback, mobile overview, retired redirect and client disclosure/scope checks. Unit tests cover declined/conditional/missing-evidence acceptance, exact advance/receipt/reversal, malformed/unbalanced TB, stale review, critical confirmation exceptions/cancellation, modified-opinion validation, frozen superuser writes, cross-client access, corrupt imported target records, balanced firm ledger and seeded sampling replay.

[Executed browser journey JSON](evidence/target-browser-journey.json) · [Frozen archive screenshot](evidence/target-frozen-archive.png) · [Detailed rehearsal](target-lifecycle-demo.md).

## Evidence limits

The browser journey uses actual store commands in Chrome with rendered checkpoints; it is not a click-by-click user acceptance of every form. The former browser suite was retired because its product surfaces were retired, and is not represented as having passed this refactor. No claim is made that all historical backlog cards or independent professional acceptance criteria are complete.

M365, email, identity invitations/passwords, payments, signatures, external confirmations/transmission, delivery and regulatory freeze are simulations. Metadata is browser-local and generated/uploaded bytes are in IndexedDB. A browser owner can clear or modify local storage; this is not production authentication, tenant provisioning, legal issuance, server immutability or regulatory assurance. Generated final documents use illustrative prototype wording. Physical indexes retain references, not scans of original physical files.

## Deployment

Authorized configured target: Cloudflare Pages `steaudit-prototype`, branch `production`, serving both `prototype.steaudit.com` and `steaudit-prototype.pages.dev`. Deployment uses the tested uncommitted working tree through `bash deploy.sh`; no commit or push was made. Completion/URL verification is recorded below after Cloudflare confirms it.

Deployment completed: [94bfad5e](https://94bfad5e.steaudit-prototype.pages.dev). Custom domain, project domain and deployment URL each returned HTTP 200. The custom-domain HTML and entry JavaScript matched the local production build byte-for-byte. [Deployment proof](evidence/target-deployment.json).

To rehearse from a clean state, open [the deployed prototype](https://prototype.steaudit.com), choose **Explore Scenarios → Canonical Audit Lifecycle**, and confirm replacement only after preserving any local data you need. Existing browser state is retained until that explicit scenario change.
