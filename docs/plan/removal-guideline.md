# Removal & Consolidation Guideline

**Goal:** leave exactly one implementation (BUSINESS workspace: `worker/` + `src/components/business/`) so agents and humans cannot mistake prototype code for product code.
**Executed by:** E01-S01 … E01-S05 (pinning is E02-S02). Each section says *what*, *why*, *preconditions*, and *how to prove it was safe*.
**Evidence base:** import-graph reachability computed from `src/components/business/BusinessWorkspace.tsx`, `src/services/businessWorkspace.ts` and all `worker/business*.ts` modules at `54ec5a3` (resolver maps `.js` → `.ts`).

## 0. Golden rules

1. **Tag first.** Before any deletion: `git tag archive/prototype-2026-10 <sha>` and push the tag. History is the archive; do not create `legacy/` or `archive/` folders on `main`.
2. **Delete, do not comment out.** No dead flags, no `if (false)`.
3. **One concern per PR**, in the order of §5. After each PR: lint, worker typecheck, unit, build, e2e all green.
4. **Never delete an applied SQL migration file.** Retire tables only with a new forward migration (E01-S05).
5. **Prove unreachability before deleting runtime code:** `rg -n "<symbol or path>" src worker tests tools` must return only the files being deleted.
6. Tests that exist only to exercise deleted code are **retired with it**, and listed in the PR description. Do not "port" them.

## 1. Delete outright — no runtime dependency

| Path | Why | Precondition / proof |
|---|---|---|
| `ste-audit/` (entire) | Separate Next.js/Prisma demo; client-state only; no API routes; excluded from CI (ADR-0002) | Owner confirmation (ADR-0002). `rg -n "ste-audit" .github worker src tests tools` → only the CI comment, which is removed in the same PR. |
| `gui-test-screenshots/`, `previews/` | Demo screenshots | none |
| `docs/Prototype_Review_Evidence_2026-09-27/` | Historical review evidence | none |
| `docs/prototype/evidence/**`, `docs/prototype/visual-parity-reference/**` | PNG/PDF/JSON evidence and Blazor/C# visual references (`AuditSphereTheme.cs`, `MainLayout.razor`) | `rg -n "docs/prototype/evidence" tests tools` → only legacy tests removed in E01-S03 |
| `tracking/`, `PACK_README.md`, `02_CLIENT_DEMO_PLAYBOOK.md`, `03_EXECUTION_RULES.md` | Execution pack pinned to another repository (`auditsphere-visual-prototype@b24359c`) | none |
| `reference/REVIEW_FINDINGS.md`, `ROLE_HANDOFF_GUIDE.md`, `SCOPE_AND_STORAGE_BOUNDARIES.md`, `SOURCES.md`, `VERIFIED_BASELINE_DO_NOT_REBUILD.md` | Describe the browser-only prototype; contradict the BUSINESS architecture | none |
| `test_prototype.py`, `test_roles.py`, `test_workpaper_workspace.py`, `tools/progress.py`, `tools/test_progress.py`, `tools/criterion_ledger.py`, `tools/test_criterion_ledger.py`, `docs/prototype/criterion-map.json`, `docs/prototype/criterion-evidence-ledger.md` | Python tooling for prototype acceptance ledgers; not run by CI | `rg -n "criterion_ledger\|progress.py" .github package.json` → none |
| `deploy.sh` | Deploys to **Cloudflare Pages** (`steaudit-prototype`) — superseded by Worker deploy in CI | none |
| `metadata.json` | AI-Studio scaffold metadata (declares a Gemini capability) | none |
| `.zcodeignore` | Tool-specific ignore file for a non-project tool | none |
| `vite.business-preview.config.ts` | Unreferenced preview config (port 3004 → 3003 proxy) | `rg -n "business-preview" package.json tests tools .github` → none (verified) |
| `templates/` (root) | Duplicate of `public/templates/WP-A1_*`; only used by `deploy.sh` | after `deploy.sh` removal |
| `.env.production` | Empty/commented; production config is Wrangler + secrets | none |

**Move, don't delete:**
| From | To | Why |
|---|---|---|
| `reference/STE_Audit_Management_Tool_Detailed_User_Stories_v2.1.md` | `docs/product/source/ste-user-stories-v2.1.md` | Canonical story IDs used by this backlog |
| STE v2.1 specification (Google Doc export) | `docs/product/source/ste-spec-v2.1.md` | Single source requirement in-repo |
| `docs/prototype/integration-configuration.md`, `cloud-full-stack-runbook.md` | merge into `docs/ops/integrations.md`, `docs/ops/runbook.md` | Still-true operational content; delete the rest of `docs/prototype/` |
| `synthetic_trial_balance.csv` | `tests/fixtures/synthetic_trial_balance.csv` | Keep only if a remaining test reads it; otherwise delete |

## 2. Delete with code changes — legacy runtime

### 2.1 Legacy browser-store UI (E01-S03)

**Keep (BUSINESS UI reachability set):**
`src/App.tsx` (after edit), `src/main.tsx`, `src/vite-env.d.ts`, `src/components/business/**`, `src/components/common/StatusBadge.tsx`, `src/domain/procedureConflict.ts`, `src/domain/reportingStandards.ts`, `src/services/businessWorkspace.ts`, `src/services/practiceAccounts.ts`, `src/services/statusSemantics.ts`, `src/shared/api/business.ts`, `src/shared/api/errors.ts`.

**Delete:**
- `src/PrototypeApp.tsx` and the `DevelopmentPrototypeApp` lazy import + `VITE_TEST_HARNESS` branch in `src/App.tsx` and `src/vite-env.d.ts`.
- `src/store/**` (5 files).
- `src/components/modules/**`, `src/components/target/**`, `src/components/layout/**`, `src/components/walkthrough/**`, `src/components/clientRequirements/**`.
- `src/components/common/*` **except** `StatusBadge.tsx`.
- `src/services/*` **except** the three kept above. (Includes `targetLifecycle.ts`, `calculations.ts`, `guards.ts`, `exportService.ts`, `routeCatalog.ts`, `cloudWorkspace.ts`, `projectTemplates.*`, …)
- `src/domain/*` **except** `procedureConflict.ts`, `reportingStandards.ts` — **after** 2.2 removes the Worker's legacy command path, which is what imports them today.
- `src/shared/api/commands.ts`, `files.ts`, `sessions.ts` — after 2.2 (legacy Worker imports).
- `src/types/index.ts`, `src/types/targetLifecycle.ts` — after 2.2 (`worker/db.ts`/`worker/state.ts` are their last importers); if any BUSINESS file still needs a type, move that type into `src/shared/api/business.ts`.
- `tools/generate-requirements-deck.mjs`, `public/Client_Requirements.html`, and the deck step in `package.json` `build` (`node tools/generate-requirements-deck.mjs && …`).
- `tools/current-workflow-matrix.ts`, `tools/benchmark-review-projections.ts`, `tools/seed-cloud-workspace.ts` and the `cloud:seed` script.

**CSS (measured):** of 172 class names used by the BUSINESS UI, `business-workspace.css` defines 150; `styles.css` 5, `src/enterprise.css` 7, `roles.css` 1, `src/host.css` 0, `src/persona.css` 0. Move the 13 used rules (plus any `:root`/`body` base rules that change rendering) into `src/components/business/business-workspace.css` or a new `src/styles/base.css`, then delete `styles.css`, `roles.css`, `src/host.css`, `src/enterprise.css`, `src/persona.css` and their imports in `src/main.tsx`. **Proof:** E2E screenshots at 390 and 1440 px before/after show no layout change (pixel diff or side-by-side review attached to PR).

### 2.2 Legacy Worker TEST snapshot mode (E01-S02)

**Delete from `worker/index.ts`:** `requireTestSnapshotApi`, `handleSeeds`, the seeded branch of `handleCreateWorkspace` (whole handler goes in E03-S08), `handleResumeWorkspace`, `handleState`, `handleEvents`, `handleDeleteWorkspace`, `handlePersonaSwitch`, `handleLogout`, the TEST branch inside `handleCommand`, `handleChanges`, `handleGetWorkspace`, `handleFile*` (keep each BUSINESS branch), and routes `/api/seeds`, `/api/workspaces/resume`, `/api/workspaces/:id/state`, `/api/workspaces/:id/events`, `DELETE /api/workspaces/:id`, `/api/session/persona`, `/api/session/logout`.
**Delete files:** `worker/sessions.ts`, `worker/state.ts`, `worker/files.ts` (only `worker/index.ts` imports it; its `cleanupStagedFiles` sweeps the legacy `file_objects` table only — BUSINESS `file_versions` have no equivalent sweep, tracked as E06-S07), legacy functions in `worker/db.ts` (keep `getWorkspace`, `requireWorkspace` and anything `rg` shows BUSINESS uses), `TEST_SNAPSHOT_API_ENABLED` and manifest/scalar document keys in `worker/env.ts`.
**`scheduled()`:** remove the TEST-workspace expiry update and the `demo_workspaces`/`demo_creation_limits` deletes. Keep idempotency-key purge only if `idempotency_keys` is still written by any remaining path (else remove with E01-S05).
**Proof:** route-inventory test lists the remaining routes; `rg -n "TEST_SNAPSHOT_API_ENABLED|workspace_entities|resolveSession\b|runWorkspaceCommand" worker src tests` → no results.

### 2.3 Tests retired with legacy code

Retire (they import legacy `src/store`, `src/domain/commands`, `src/components/{modules,target,clientRequirements,walkthrough}` or legacy services):
`calculations`, `clientRequirementsDeck`, `conformityBacklog`, `currentOnlyArchitecture`, `detailedUserStories`, `docsContract`, `documentAvailabilityMatrix`, `enterpriseUx`, `finalAlignment`, `gl-import`, `guards`, `lifecycleGaps`, `pbcRequestLifecycle`, `populationImport`, `projectTemplates`, `reproduction_register`, `reviewCompletion`, `reviewFindings`, `reviewRemediation`, `scope`, `steRequirementsConformance`, `targetLifecycle`, `terminalStateInventory`, `visualParity`, `walkthroughModel`, `workflowProgress`, `workpaperApplicability` (all `tests/unit/*.test.ts`), `tests/unit/packageFixture.ts` if unused, `tests/e2e/targetLifecycle.test.ts`, `tests/helpers/{targetFixture,targetJourney,visibleAlignmentJourney}.ts`, `tests/fixtures/{current-partner-approval,legacy-seed-f5f4f78}.json`, `tests/historical/`, `tests/cloud/api.test.ts` (exercises the legacy seed/resume snapshot API; remove `test:cloud` script too).

**Keep but fix imports:** `businessWorkspace`, `businessCommandConcurrency`, `businessWorkspacePersistence`, `verificationIngest`, and `tests/e2e/business*.test.ts` currently reach `src/domain/commands.ts` **only transitively through `worker/index.ts`**; they become clean once 2.2 lands. If any of them *directly* asserts legacy behaviour (e.g. snapshot API returns 404), keep that assertion as a negative test.

> Before retiring, check whether a legacy test covers a rule that has **no** BUSINESS-path equivalent test (e.g. a calculation edge case). If so, write the BUSINESS-path test first, in the same PR.

## 3. Conditional removals (need an owner decision)

| Item | Decision | If "remove" | If "keep" |
|---|---|---|---|
| Legacy-to-BUSINESS migration tooling (US-SYS-002): `tools/business-migration-*.ts`, `tests/unit/businessMigration*.test.ts`, `docs/prototype/business-data-migration-audit.md`, `/api/workspaces/:id/migration-status`, guard triggers 0039–0041 | D2: any real data in `TEST` workspaces? | Delete code/tests/route; leave applied migrations; optionally drop `migration_runs`/`migration_id_map` in 0050 | Finish US-SYS-002 invoice/engagement transformation as a new story |
| Verification-run ingest (`/api/internal/verification-runs`, `verification_runs` table, `tools/ingest-verification-run.mjs`, `tools/write-verification-support-bundle.ts`, CI job `record-sandbox-verification`, `/api/health/support-bundle`) | Owner: is CI-evidence-in-D1 still wanted? | Remove from production env; keep CI artefact upload | Keep, but only in staging env |
| SharePoint adapter (`worker/integrations/sharepoint.ts`, `SHAREPOINT_*` vars) | ADR-0007 | Remove adapter + vars + tests | Keep as optional mirror; E04-S04 |
| `public/templates/**` (firm Word/Excel templates, confirmation letters, QFC resolutions) | Are they confidential? They are **publicly served** from `dist/` and the repo is public | Move out of `public/`; store as private R2 template assets | Keep, but confirm they contain no confidential firm content |

## 4. Repository visibility (recommendation)

The GitHub repository is **public** (anonymous clone succeeds). It contains the Entra tenant ID, app client ID, SharePoint site path, D1 database ID and firm templates. None are secrets on their own, but a production audit system should not publish its tenant topology. **Recommend making the repository private before E02 creates production resources.** This is an owner action, not an agent task.

## 5. Execution order

1. E01-S01 — tag; delete §1 "outright" items; move source docs.
2. E01-S02 — Worker TEST mode removal (§2.2).
3. E01-S03 — legacy UI, services, domain, types, tests, CSS consolidation (§2.1, §2.3).
4. E01-S04 — rename code-only prototype identifiers (package name, UI copy) and rewrite README + CLAUDE.md.
5. E01-S05 — conditional: drop legacy tables (data-model-delta §6) and/or migration tooling, after D2.
6. (M2) E02-S02 — pin dependencies.

## 6. Do NOT remove

`worker/migrations/*.sql` (all), `worker/r2-archive-locks.json`, `tools/generate-r2-archive-lock-rules.ts`, `tools/apply-r2-archive-lock-rules.ts`, `tools/benchmark-local-worker-20-users.ts` (reused by E06-S05), `public/fonts/NotoSansArabic-*` (embedded by `worker/proposalDocument.ts` / `worker/businessOutbox.ts` PDFs), `worker/emailProvider/**`, `tests/helpers/{sqliteD1,headlessChrome,cdp,businessE2eServer,businessBackupRestore,reportingPdf}.ts`, `.github/workflows/ci.yml` (edit, don't delete), `index.html`, `.nvmrc`, `.gitattributes`.
