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
| Claude Code | VP-064-E02 — rehearse presenter guide (`demo-scenarios.md`, `02_CLIENT_DEMO_PLAYBOOK.md`) on current tree incl. fresh/empty and failure/rework paths; browser run on a dev server at port 3100 (does not touch `dist/` or port 3000) | `src/components/modules/ClientDetailView.tsx`, `src/components/modules/ApprovalsEQRView.tsx`, new test `VP-064-E02: empty-practice preset…` in `tests/e2e/app.test.ts` (inserted before VP-051), `docs/prototype/demo-rehearsal-2026-09-27.md` | Rehearsal recorded in `demo-rehearsal-2026-09-27.md`; tracker row VP-064-E02 → Partial (single-row edit only). Focused E2E queued to run *after* the Codex full run exits. Needs commit to pin. **Found + fixed 2 demo-blocking crashes:** on `empty-practice`, `#client-detail` and `#approvals` threw (`reading 'id'` / `'eqrReviewerUserId'`) and blanked the whole app. All 6 presets × all routes otherwise clean. | 15:10 |
