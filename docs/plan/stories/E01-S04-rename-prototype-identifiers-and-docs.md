# E01-S04 — Rename prototype identifiers in code and copy; rewrite README and CLAUDE.md

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S04 | E01 | Docs/Cleanup | P1 | S | E01-S03 | — |

## Intent
Remove "prototype/demo/visual" language from code-level identifiers and user-visible copy that are safe to rename without touching cloud resources, and make top-level docs describe the post-cleanup repository.

## Read first
- `README.md`, `package.json`, `src/App.tsx` landing copy, `docs/plan/removal-guideline.md` §5

## Current state
- `package.json` `name: auditsphere-practice-prototype`; landing copy says "self-selected personas … does not verify identity"; `wrangler.jsonc` name `auditsphere-visual-prototype` (cloud resource — **not** renamed here; E02-S01 creates properly named environments).

## Implementation progress — 2026-10-08
- Renamed the npm package to `auditsphere` in `package.json` and the lockfile; replaced stale prototype README and contributor guidance with the current BUSINESS workspace architecture, commands, and documentation map.
- Reworded the workspace reset control to “Switch workspace” and updated its E2E assertions. Kept the truthful self-asserted identity warning. Cloud resource identifiers remain unchanged per scope.
- Added `tests/unit/docsPaths.test.ts` to validate repository paths linked in README and CLAUDE guidance.
- `tests/unit/docsPaths.test.ts`, app and Worker typechecks, `npm run test:unit` (168 passed / 1 skipped), and `npm run build` passed. The local E2E run was stopped after six scenarios failed or timed out at roughly 55–60 seconds and Chrome profile cleanup reported Windows `EPERM`; full E2E remains open.
- Final identifier sweep removed the obsolete “prototype” wording from BUSINESS connection-error copy and runtime comments. The filtered grep's remaining intentional matches are: `package.json`'s `cloud:migrate` target `steaudit-prototype-demo` (current D1 resource, E02-S01); `tools/apply-r2-archive-lock-rules.ts` fallback `auditsphere-prototype-files` (current R2 resource, E02-S01); generated `worker/worker-configuration.d.ts` origin declarations and standard TypeScript `prototype` members; E2E helpers using `Object.getPrototypeOf` and DOM prototype setters; and `currentOnlyArchitecture.test.ts` checking that `src/PrototypeApp.tsx` is absent.
- Status: **implementation complete; browser acceptance pending**.

## Scope
**In:** `package.json` `name` → `auditsphere`; README rewritten (purpose, architecture diagram from `docs/architecture/overview.md`, commands from `docs/quality/testing.md`, link index to `docs/`); `CLAUDE.md` installed from this doc set and paths fixed; UI copy strings that say "prototype".
**Out:** Worker/D1/R2 names, `wrangler.jsonc` resource IDs, the self-asserted-persona warning (keep it until E03-S08 removes self-selection — it is truthful until then).

## Acceptance criteria
1. `rg -n -i "prototype" --glob '!docs/**' --glob '!worker/migrations/**' --glob '!wrangler.jsonc' --glob '!package-lock.json' .` → only intentional matches, each listed in the report with a reason.
2. `README.md` ≤ 150 lines, commands match `package.json` scripts exactly, and every linked doc path exists.
3. `CLAUDE.md` at repo root (and `AGENTS.md` as a one-line pointer for Codex) — every existing-file path it names exists: `tests/unit/docsPaths.test.ts` parses backtick paths in `CLAUDE.md` and `README.md` and asserts existence, skipping lines marked **[TARGET]** or *(new)*. (Story and spike files intentionally name files that do not exist yet; they are not scanned.)
4. All suites green.

## Verify with
```bash
npx tsx --test tests/unit/docsPaths.test.ts && npm run test:unit && npm run build
```

## Stop and ask if
- A rename would change an API response field or stored value.
