# US-UIUX-001 implementation handover

Verified 2026-09-30. Local implementation of the supplied user story; no deployment, push, commit, or human client acceptance is claimed.

## Revision and authority

- Final checked-out prototype SHA: `b9bd29c061c1765cc4537bc5af101b110d03ea1c`. Implementation is an uncommitted working-tree delta against this SHA, so this SHA alone does not identify the new implementation.
- The attachment named an older prototype baseline (`654c61f1f490618de020ddbfdeccfb778f63ffc6`); work used the actual checkout above.
- AuditSphere visual reference SHA: `5d1009dd59d9f888cf9b626bb5823f1578493521`.
- Pinned reference sources are retained in `visual-parity-reference/`: `AuditSphereTheme.cs`, `enterprise-ui.css`, and `MainLayout.razor`.
- Requirements: [supplied story](US-UIUX-001.md). The attached review was treated as findings and requirements context, not as authorization to publish or certify professional compliance.

## Executed evidence

| Requirement | Implementation | Evidence |
|---|---|---|
| Five modules, portal/reference, eleven states | Shell groups and target-only guide; eleven-state overview; canonical redirects | Unit deck/route contracts; Chrome overview and responsive scope checks |
| Presenter separation and debug cleanup | Identity, scenario, reset and global search behind Presenter / Demo Controls; removed root debug_acceptance.ts | Hidden normal identity/search assertions at 72 route/width combinations |
| Acceptance and continuance | Mandatory Track A integrity/viability; deliberate six-answer Track B; persisted track/prior reference; exact case binding; dirty-form serialization/save/discard | Acceptance guard and continuance tests; complete Chrome journey; mobile Acceptance image |
| Materiality and authority | Shared benchmark/TE/SAD validator, finite inputs, +/-5% PM rounding, Partner-only approval, source staleness | Guard/materiality tests and full planning journey |
| Analytical Review / ISA 570 | Deliberate answers and conclusion; attributed record pins TB/mapping/plan; applicable procedure moves to In progress; stale records block review | Focused Analytical Review test and journey. This is preparer sign-off with independent procedure review still required |
| Holding Letters | Persisted numbered issue records with blockers, recipient and artifact; portal only shows issued records | Two-revision persistence test; critical confirmation remains a blocker |
| Sampling | Fractional systematic interval covers population tail; attribute strata use transaction direction, not monetary ranking | N=10/n=6 inclusion test over reproducible seeds; existing sampling/journey tests |
| Profitability | Logged hours multiplied by charge-out rates; missing rate gives Unknown; internal cost remains separately identified | Charge-out versus internal-cost test; missing-rate test |
| Supporting corrections | Same-client/service/currency prior mapping; saved credentials and simulated dispatch history; recorded capacity/leave/targets; attributed expiring local row leases | Existing scoped/mapping/staffing contracts, focused lease test, source implementation |
| Requirements deck | One shared JSON source, 17 slides, generated root/public standalone deck and matching React view | Deck contract tests, build generation, desktop/mobile presentation screenshots |
| Visual parity | Exact reference palette, system typography, 232px sidebar/73px app bar, panels and responsive layout | Pinned sources, computed font/color checks recorded per viewport, 24 screenshots |
| Five flows and client PBC | Commercial activation, governance/planning, fieldwork/SRM, release/archive, time/practice; scoped client upload and handoff | [Chrome command journey](evidence/target-browser-journey.json), rendered checkpoints, artifact and access checks |

## Verification results

- `npm run test:unit`: **380 passed, 0 failed**.
- `npm run test:e2e` with `CHROME_PATH=C:\Program Files\Google\Chrome\Application\chrome.exe`: **4 passed, 0 failed**; includes TypeScript validation and production Vite build.
- `git diff --check`: passed. Git emits normal Windows line-ending conversion notices.
- Responsive checks: **72 passed**: twelve surfaces at 320, 390, 760, 1024, 1440 and 1920px. Every requested hash is active, no unsaved dialog stalls navigation, and document width stays within the viewport.
- Desktop (1440px) and mobile (390px): **24 PNG captures**, under [visual evidence](evidence/visual-parity/responsive-results.json). Required surfaces: overview, proposal, acceptance, materiality, split statements, fieldwork, SRM/review, deliverables, archive, practice analytics, PBC portal and presentation.
- Manual image inspection included mobile Acceptance and desktop Requirements Presentation; screenshot checks are not a pixel-diff or human acceptance certification.

## Design tokens

Primary `#2B6CB0`; secondary `#0B6B65`; sidebar `#0F172A`; background `#F8FAFC`; text `#17212B`; border `#E2E8F0`; control border `#7E8A9C`; success `#15803D`; warning `#B45309`; error `#B91C1C`. System font stack, base 14px; 232px desktop sidebar; 73px app bar; 6px controls and 10px panels; shell collapses below 960px.

## Removed and retained routes

Retired bookmarks redirect to owning target surfaces: jobs/budgets -> scheduling; job-templates -> audit-risks; communications/m365-setup -> documents; receivables -> billing; accounting-setup/gl-transactions/account-mappings/reconciliations -> trial-balance; adjustments -> findings; financial-packages -> delivery; consolidation/administration -> overview; audit/quality/approvals -> reviews; services -> proposals. Time-tracking redirects to the retained daily engagement/FSLI time workspace.

Retained target surfaces: overview, acquisition, clients/client-detail, proposals, engagements, billing, onboarding, documents, scheduling, trial-balance, audit-planning, audit-risks, financial-statements, audit-fieldwork, sampling, confirmations, findings, reviews, delivery, records, my-time, reports, practice-ledger, portal and requirements/presentation reference. Supporting records and compatibility code remain internal; they do not create extra operational modules.

## Local and production boundaries

Email/WhatsApp dispatch, Microsoft 365 provisioning, authentication/personas, signatures, payment and immutable storage remain clearly identified simulations. Local row leases protect the shared browser-store revision; they are not distributed multi-user server locks. Availability is recorded capacity/leave, not an HR integration. There is no live email/payment/storage service or professional audit certification. Browser checks exercise store commands and rendered checkpoints; they do not prove every form interaction or establish a human sign-off.

The subsequent user request integrates suitable files from public/templates as native working references. See [template mapping](project-templates.md). Originals remain unchanged. No production migration or release was performed.

## Changed files

Tracked implementation/evidence changes:

- `Client_Requirements.html`
- `debug_acceptance.ts`
- `docs/prototype/evidence/target-browser-journey.json`
- `docs/prototype/evidence/target-frozen-archive.png`
- `docs/prototype/lifecycle-matrix.md`
- `package.json`
- `src/App.tsx`
- `src/components/clientRequirements/deckData.ts`
- `src/components/clientRequirements/moduleMap.ts`
- `src/components/common/ModuleGuideStrip.tsx`
- `src/components/layout/Shell.tsx`
- `src/components/modules/AuditAcceptanceView.tsx`
- `src/components/modules/AuditPlanningView.tsx`
- `src/components/modules/ProposalsView.tsx`
- `src/components/modules/TimeTrackingView.tsx`
- `src/components/target/AuditFinancialView.tsx`
- `src/components/target/ClientRequirementsPresentationView.tsx`
- `src/components/target/LifecycleOverviewView.tsx`
- `src/components/target/PbcWorkspaceView.tsx`
- `src/components/target/PracticeView.tsx`
- `src/components/target/SchedulingView.tsx`
- `src/components/target/TargetSamplingView.tsx`
- `src/components/target/TrialBalanceView.tsx`
- `src/enterprise.css`
- `src/host.css`
- `src/services/calculations.ts`
- `src/services/legacyRoutes.ts`
- `src/services/routeCatalog.ts`
- `src/services/targetLifecycle.ts`
- `src/store/prototypeStore.ts`
- `src/store/targetLifecycleCommands.ts`
- `src/types/targetLifecycle.ts`
- `styles.css`
- `tests/e2e/targetLifecycle.test.ts`
- `tests/helpers/targetJourney.ts`
- `tests/unit/clientRequirementsDeck.test.ts`
- `tests/unit/guards.test.ts`
- `tests/unit/lifecycleGaps.test.ts`
- `tests/unit/steRequirementsConformance.test.ts`
- `tests/unit/terminalStateInventory.test.ts`
- `tests/unit/workflowProgress.test.ts`

New implementation artifacts: `src/components/clientRequirements/requirementsDeck.json`, `tools/generate-requirements-deck.mjs`, `tests/unit/visualParity.test.ts`, `public/Client_Requirements.html`, this handover, supplied-story copy, pinned reference sources and visual evidence folder.
