# E02-S02 — Pin dependency versions exactly

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E02-S02 | E02 | Infra | P0 | S | M1 | NFR MNT-01 |

## Intent
Make `package.json` state the exact versions `package-lock.json` already resolves, so agents and Dependabot-style tools cannot drift silently.

## Current state (verified)
`package.json` uses `^` for `docx`, `jspdf`, `react`, `react-dom`, `xlsx`, `@types/*`, `@vitejs/plugin-react`, `tsx`, `typescript`, `vite`, `wrangler`. Lockfile resolves: react 19.3.0, react-dom 19.3.0, typescript 7.0.2, vite 8.3.0, wrangler 4.147.0, zod 4.6.5, jspdf 4.2.1, docx 9.7.1, xlsx 0.18.5, fflate 0.8.3, @noble/hashes 2.2.0, tsx 4.23.15, @vitejs/plugin-react 6.1.1.

## Acceptance criteria
1. Every dependency and devDependency in `package.json` is an exact version equal to the lockfile's resolved version (no `^`, `~`, `*`, ranges or tags).
2. `npm ci` produces no lockfile change (`git diff --exit-code package-lock.json`).
3. `.npmrc` contains `save-exact=true`.
4. A test (`tests/unit/dependencyPins.test.ts`) asserts AC1 by reading both files.
5. `docs/architecture/overview.md` §6 table matches.

## Constraints
No version upgrades or downgrades in this story.

## Verify with
```bash
npm ci && git diff --exit-code package-lock.json && npx tsx --test tests/unit/dependencyPins.test.ts && npm run build
```
