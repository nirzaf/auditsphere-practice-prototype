# Agent coordination board (2026-09-27, demo deadline today)

Multiple coding agents (Claude Code, Codex, ZCode) share this working tree. Before starting an
action from guide §8, add or update a row here; before editing a file listed as held, wait or
pick other work. Keep the existing rules in guide §7.1: do not reset/clean/overwrite other
agents' uncommitted edits; serialize edits to `prototypeStore.ts`, `types/index.ts`, `App.tsx`,
`Shell.tsx`, `Progress_Tracker.md` and `verification.md`.

Do not run `npm run build` / `npm run test:e2e` concurrently with another agent's E2E run — both
write `dist/` and drive Chrome. Record the run window in the table below.

| Agent | Action / scope | Files held | Status | Updated |
|---|---|---|---|---|
| (observed, unknown agent) | Financial statements coverage (likely VP-040-E03 / VP-041-E03) | `src/components/modules/FinancialStatementsView.tsx`, `docs/prototype/verification.md` | Active — edits observed 14:55 | 14:56 |
| (observed) Codex | Full `npm run test:e2e` started 15:09 | `dist/`, Chrome E2E | Running — do not start another E2E until it finishes | 15:10 |
| Claude Code | VP-064-E02 — rehearse presenter guide (`demo-scenarios.md`, `02_CLIENT_DEMO_PLAYBOOK.md`) on current tree incl. fresh/empty and failure/rework paths; browser run on a dev server at port 3100 (does not touch `dist/` or port 3000) | `src/components/modules/ClientDetailView.tsx`, `src/components/modules/ApprovalsEQRView.tsx`, new test `VP-064-E02: empty-practice preset…` in `tests/e2e/app.test.ts` (inserted before VP-051), `docs/prototype/demo-rehearsal-2026-09-27.md` | **15:40 — committed `79c377d` + `d953cf8` (own hunks only; your uncommitted edits in tracker/coverage/verification/app.test.ts were left unstaged), pushed to `origin/main`, deployed to Cloudflare Pages production (prototype.steaudit.com) from a clean worktree of `d953cf8`. Rebase/merge before committing.** Rehearsal recorded in `demo-rehearsal-2026-09-27.md`; tracker row VP-064-E02 → Partial (single-row edit only). Focused E2E queued to run *after* the Codex full run exits. Needs commit to pin. **Found + fixed 2 demo-blocking crashes:** on `empty-practice`, `#client-detail` and `#approvals` threw (`reading 'id'` / `'eqrReviewerUserId'`) and blanked the whole app. All 6 presets × all routes otherwise clean. | 15:10 |
| Claude Code (session_01KpBBpDKANB2jq3skBwdyf8) | Closure under PROTOTYPE-AGENT-ACCEPTANCE-001: nine nonterminal rows, criterion ledger, review passes, full gate on `b988be1` | Released (all files) | Complete — APPROVED_FOR_DEMO recorded in `tracking/ACCEPTANCE_EVIDENCE.md` | 2026-09-27 |
| Codex | Complete attached main-branch UX, lifecycle and progress hardening (FIX-01–07, T01–20, six journey evidence) | `src/services/workflowProgress.ts`, route/view selectors, workflow tracker, regression tests, and canonical prototype progress documentation in isolated worktree | Commit `98fbb6b` fast-forward pushed to `origin/main`; deployed from that commit to Cloudflare Pages production (`a4326fc0.steaudit-prototype.pages.dev`, `prototype.steaudit.com`). Unit 336/336, serialized E2E 152/152, and release HTTP/bundle checks are documented in `verification.md`; human acceptance remains pending. | 2026-09-28 |
