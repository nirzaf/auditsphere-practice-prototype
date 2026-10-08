# E01-S03 — Remove legacy browser UI, services, domain and tests; consolidate CSS

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S03 | E01 | Cleanup | P0 | L (may split into S03a code / S03b CSS) | E01-S02 | ADR-0003 |

## Intent
Leave `src/` with only the BUSINESS UI and its 20 reachable files; retire legacy tests; collapse five global stylesheets into the business stylesheet without visual change.

## Read first
- `docs/plan/removal-guideline.md` §2.1, §2.3
- `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts`
- `package.json` scripts (`build` runs `tools/generate-requirements-deck.mjs`)

## Current state (verified at `54ec5a3`)
- BUSINESS UI reachability set (keep): `src/components/business/**`, `src/components/common/StatusBadge.tsx`, `src/domain/{procedureConflict,reportingStandards}.ts`, `src/services/{businessWorkspace,practiceAccounts,statusSemantics}.ts`, `src/shared/api/{business,errors}.ts` + `src/App.tsx`, `src/main.tsx`, `src/vite-env.d.ts`.
- CSS: 172 class names used by BUSINESS UI; definitions found — `business-workspace.css` 150, `src/enterprise.css` 7, `styles.css` 5, `roles.css` 1, `src/host.css` 0, `src/persona.css` 0.

## Scope
**In:** every "Delete" bullet of removal-guideline §2.1 and every retired test in §2.3; build script deck step; CSS consolidation.
**Out:** changes to BUSINESS component behaviour or markup (except class-name-neutral CSS moves).

## Acceptance criteria
1. `src/` contains only the keep-set above plus any file `rg` proves is imported by it (list extras in report). `src/PrototypeApp.tsx`, `src/store/`, `src/components/{modules,target,layout,walkthrough,clientRequirements}/` do not exist.
2. `src/App.tsx` has no `VITE_TEST_HARNESS`/`PrototypeApp` reference; `src/vite-env.d.ts` no longer declares `VITE_TEST_HARNESS`.
3. `npm run build` no longer runs `tools/generate-requirements-deck.mjs`; `public/Client_Requirements.html` and the tool are deleted.
4. `src/domain/`, `src/services/`, `src/shared/api/`, `src/types/` contain only files with at least one importer in `src/` or `worker/` (prove with the reachability script in the report, or `rg` per file).
5. Every test listed in removal-guideline §2.3 is deleted; `tests/unit/currentOnlyArchitecture.test.ts` is replaced by a smaller test asserting: no `src/PrototypeApp.tsx`, no `src/store/`, `src/App.tsx` imports only `./components/business/*` and `./services/businessWorkspace`.
6. Before deleting a legacy test, the agent checks whether it covers a rule with no BUSINESS-path test; any such rule gets a new BUSINESS-path test in this PR (list them; "none found" is an acceptable answer if justified).
7. CSS: `styles.css`, `roles.css`, `src/host.css`, `src/enterprise.css`, `src/persona.css` deleted; the 13 used rules and any `:root` tokens / element selectors (`body`, `html`, `button`, `input`, …) that affect BUSINESS rendering moved into `src/styles/base.css` (imported once by `src/main.tsx`) or `business-workspace.css`.
8. Visual non-regression: E2E screenshots of overview, PBC, fieldwork, reporting and practice panels at 390×844 and 1440×900, before vs after, attached or described with a pixel-diff result; no layout change except removal of unused legacy styles.
9. All retained suites green. Report gives before/after unit test counts.

## Implementation notes
- Delete leaves first (`src/store/**`, `src/components/target/**`), run `npm run lint`, repeat — the compiler finds orphans.
- CSS measurement method: extract `className` tokens from BUSINESS `.tsx` files; for each global CSS file, grep `\.<class>\b`. Also copy rules with selectors not based on classes (`*`, `body`, `:root`, `[data-theme]`).
- Dependencies: all runtime deps remain in use by `worker/` after this story (`jspdf` ×3, `xlsx` ×3, `docx`, `fflate`, `@noble/hashes` — verified at `54ec5a3`). Do not remove any; re-check with `rg -n "from '(docx|jspdf|xlsx|fflate|@noble/hashes)" worker src`.

## Constraints
- No markup or behaviour change in `src/components/business/**` beyond CSS import paths.
- No new dependencies.

## Verify with
```bash
npm run lint && npm run cloud:typecheck && npm run test:unit && npm run build && npm run test:e2e
```

## Stop and ask if
- A BUSINESS component visibly depends on a legacy stylesheet rule you cannot attribute.
- Any file in the keep-set turns out to import a file on the delete list.
