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
