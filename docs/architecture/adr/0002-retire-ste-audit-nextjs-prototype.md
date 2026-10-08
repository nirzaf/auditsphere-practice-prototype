# ADR-0002 — Retire the `ste-audit/` Next.js/Prisma prototype

- **Status:** Proposed — accept when the firm owner confirms (PRD decision table)
- **Date:** 2026-10-08

## Context
`ste-audit/` was added in a single commit (`d4af4f1`, 2026-09-30). It has its own lockfile, is excluded from CI, has no API routes (`src/app` contains only `layout.tsx`, `page.tsx`), and duplicates materiality/sampling/state-machine logic already implemented and tested in `worker/`. Its presence makes agents believe a second "production implementation" exists.

## Decision
Tag the current commit `archive/ste-audit-2026-10` and delete `ste-audit/` from `main` (E01-S01).

## Alternatives
- Keep as reference — rejected: drift risk, agent confusion, and its Prisma schema contradicts the D1 schema.
- Move to a separate repo — acceptable alternative if the owner wants to keep it visible; same effect on `main`.

## Consequences
Remove the CI comment referencing `ste-audit/`'s lockfile. No runtime impact (nothing imports it).
