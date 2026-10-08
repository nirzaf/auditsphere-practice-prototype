# E01-S01 — Tag archive; delete non-runtime prototype artefacts and `ste-audit/`

| ID | Epic | Type | Priority | Size | Depends on | Spec trace |
|---|---|---|---|---|---|---|
| E01-S01 | E01 Single implementation | Cleanup | P0 | M | Owner accepts ADR-0002 | §1.1 unified platform |

## Intent
Remove files that no runtime path, CI job or retained test uses, so the repository shows one product. No behaviour change.

## Implementation progress — 2026-10-08
- Status: **implementation complete; browser acceptance pending**. The pushed `archive/prototype-2026-10` tag points to pre-change commit `54ec5a354089898de3afa31737e53929792ee65d`.
- Installed the remaining-work documentation pack at its repository-relative paths; SHA-256 matched all 63 copied files before removing the duplicate input directory. Moved the canonical STE user-story source and the two operational guides to their planned paths.
- Removed the unreferenced artifacts, the `ste-audit/` demo, Python prototype tooling, root duplicate templates, and stale preview configuration. Updated live integration-guide references.
- E01-S03 has now removed `tracking/`, `docs/prototype/`, and the retired legacy tests that read them; no retained source/test/tool path requires those files.
- Verification: lint, Worker typecheck, unit suite (168 pass / 0 fail / 1 opt-in skip after S03/S04 replacements), and production build pass. The local E2E run was interrupted after repeated browser-test timeouts and Windows Chrome profile cleanup `EPERM`; it did not produce final TAP diagnostics. Re-run the hosted/browser gate after the harness issue is resolved.

## Read first
- `docs/plan/removal-guideline.md` §0, §1, §6
- `docs/architecture/adr/0002-retire-ste-audit-nextjs-prototype.md`

## Current state (verified at `54ec5a3`)
- `ste-audit/` is a one-commit Next.js/Prisma demo with its own lockfile; CI's install step comment references it; nothing imports it.
- Root holds prototype packs (`tracking/`, `PACK_README.md`, `02_*`, `03_*`), Python ledger tools, screenshots and evidence folders.

## Scope
**In:** every row of removal-guideline §1 "Delete outright" and "Move, don't delete".
**Out:** anything in §2 (runtime code), §3 (conditional), §6 (do not remove).

## Acceptance criteria
1. Tag `archive/prototype-2026-10` exists on the pre-change commit and is pushed (or, if the agent cannot push, the exact `git tag` + `git push origin <tag>` commands are in the report for the owner).
2. All §1 "outright" paths are absent from the working tree.
3. `docs/product/source/ste-user-stories-v2.1.md` exists with the content of the former `reference/STE_Audit_Management_Tool_Detailed_User_Stories_v2.1.md` (byte-identical) and `reference/` is gone.
4. `docs/ops/integrations.md` and `docs/ops/runbook.md` contain the still-accurate content of `docs/prototype/integration-configuration.md` and `docs/prototype/cloud-full-stack-runbook.md`; every other file under `docs/prototype/` is deleted **except** files a retained test reads (check with `rg -n "docs/prototype" tests tools worker src`) — list any kept file in the report with the reason.
5. `.github/workflows/ci.yml` no longer mentions `ste-audit`.
6. `rg -n "ste-audit|tracking/|PACK_README|criterion_ledger|deploy\.sh|vite\.business-preview" --glob '!docs/plan/**' .` returns no matches.
7. Lint, worker typecheck, unit, build, e2e all pass; unit test count unchanged (630 pass / 1 skip) unless a retained test read a deleted file (then explain).

## Implementation notes
- Use `git rm -r`. Move with `git mv` so history follows.
- `docs/prototype/lifecycle-matrix.md` is read by `tests/unit/docsContract.test.ts`, a legacy test retired in E01-S03 — keep the doc until then.
- `synthetic_trial_balance.csv`: `rg -n synthetic_trial_balance tests tools` — if no match, delete it.
- Code comments point at moved docs (`worker/emailProvider/index.ts:4`, `worker/integrations/sharepoint.ts:4`, `worker/env.ts:40` → `docs/prototype/integration-configuration.md`). Update them to `docs/ops/integrations.md`. Comments in legacy files (`src/shared/api/commands.ts`, `src/domain/commandContext.ts`) are left; those files die in E01-S02/S03.
- Tests that read `docs/prototype/**` at `54ec5a3`: `docsContract`, `finalAlignment`, `lifecycleGaps`, `tests/e2e/targetLifecycle` — all legacy, retired in E01-S03; keep the docs they read until then.

## Constraints
- Do not touch `src/`, `worker/`, `tests/` code in this story (except removing a test that *only* reads a deleted evidence file — list it).
- Do not edit `worker/migrations/`.

## Verify with
```bash
npm run lint && npm run cloud:typecheck && npm run test:unit && npm run build && npm run test:e2e
git status --short | head -50
```

## Stop and ask if
- A file in §1 is referenced by any retained test or runtime file.
- The owner has not accepted ADR-0002 (then skip `ste-audit/` and do the rest).
