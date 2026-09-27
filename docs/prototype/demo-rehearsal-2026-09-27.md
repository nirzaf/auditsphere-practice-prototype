# Presenter rehearsal — 2026-09-27 (VP-064-E02 evidence)

Rehearsal of [`02_CLIENT_DEMO_PLAYBOOK.md`](../../02_CLIENT_DEMO_PLAYBOOK.md) and
[`demo-scenarios.md`](demo-scenarios.md) against the current working tree. Recorded by Claude Code
(coding agent). This is rehearsal evidence, **not** reviewer or owner acceptance.

## Build identity

| Item | Value |
|---|---|
| Base commit | `39ca974` (`main`) plus uncommitted working-tree changes from Codex/ZCode (tracker/coverage/verification docs, `tests/e2e/app.test.ts`) and the two fixes below |
| Runtime | Vite dev server `127.0.0.1:3100` (source-identical to `npm run build` input); Node v24.19.0 |
| Browser | Claude desktop built-in Chromium pane, 1024×768 |
| Demo clock | `asOfDate = 2026-09-23` (confirmed on dashboard) |
| Checks on the same tree | `tsc --noEmit` pass · `npm run test:unit` 281/281 pass |

**Pinning gap:** VP-064-E02 requires the rehearsal on a *committed/released* candidate. The tree
above is not yet committed, so VP-064-E02 stays **Partial** until these changes are committed and
the focused checks are rerun on that SHA.

## Defects found and fixed during rehearsal

Both were demo-blocking on the playbook's fresh/empty path (`empty-practice`): the exception
unmounted the whole React root, blanking every subsequent route until reload.

| # | Route | Symptom | Fix |
|---|---|---|---|
| R-01 | `#client-detail` (Client 360) | `TypeError: Cannot read properties of undefined (reading 'id')` — `state.clients[0]` fallback is `undefined` with zero clients | `ClientDetailView.tsx`: exported wrapper renders a "No client selected" empty state when the practice has no clients; the existing workspace (and its fallback behaviour) is unchanged otherwise |
| R-02 | `#approvals` / `#quality` (Sign-offs & EQR) | `TypeError: … reading 'eqrReviewerUserId'` — hooks dereferenced the engagement before the existing `!selectedEng` empty-state guard | `ApprovalsEQRView.tsx`: null-safe hook initialisers; guard-registration effect skips when no engagement |

Regression: new Chrome test `VP-064-E02: empty-practice preset opens every workspace route without a
render exception` in `tests/e2e/app.test.ts` (loads the real `empty-practice` preset builder,
walks 17 engagement/client-dependent routes as superuser, asserts no exceptions and the empty-state text).

## Route/persona sweep (after fixes)

| Sweep | Result |
|---|---|
| All 6 presets (`full-practice`, `accounting-only`, `audit-findings`, `two-component-consolidation`, `blocked-rework`, `empty-practice`) × 34 routes, default persona | 0 render exceptions; no `undefined`/`NaN`/`[object Object]` text. Manager is redirected from `#acquisition`/`#administration` to Overview (expected role policy). |
| `empty-practice` × 42 routes as superuser | 0 exceptions; every route shows an honest empty state |
| `full-practice` × all 23 personas (incl. client, narrow group, disabled reviewer, multi-role) × 33 routes | 0 exceptions |

## Required failure/rework stops (playbook §5)

| Stop | How to show it | Evidence |
|---|---|---|
| Same-natural-person review denial | Proposal / invoice / PBC acceptance by the preparer | Chrome AT-07/AT-08, AT-31, AT-23/24 |
| Invalid TB/GL preview keeps accepted source | Accounting-only → import unbalanced TB | Chrome AT-35, AT-36 |
| Reasoned PBC replacement retains prior evidence | PBC request → clarification → replacement | Chrome AT-23/24, AT-20 |
| Changed source stales reviewed output | Replace TB after statements reviewed | Chrome AT-37, VP-038-E01/E02, AT-41/42/48 |
| Journal with moved pinned support excluded until re-pinned | Adjustments → move pinned evidence | VP-038-E01/E02 (Chrome + unit) |
| **Significant unresolved finding blocks release** | **No preset shows this on its own** — FND-01 has no severity, so gate 3 reads "resolved". Presenter must: `audit-findings` → Findings → **Raise Finding** (severity *Significant*) → Release desk. | Rehearsed live: gate 3 changed to "1 unresolved significant/material finding(s) pending resolution" and *Freeze Release Candidate* became disabled |
| Failed/unknown simulated mail, no silent retry | Communications → compose → Failed / Unknown outcome | Chrome AT-26 |
| Release gates blocked | `blocked-rework` → Release desk | Rehearsed: gates 1, 2, 4 incomplete; freeze disabled |

## Presenter notes for today

- Load `empty-practice` only **after** the fixes above are in the served build; on older builds
  opening Client 360 or Sign-offs from an empty practice blanks the app (reload recovers).
- Loading any preset resets the persona to *Engagement manager*; switch persona afterwards.
- Keep the three closing lists separate (demonstrated / remaining acceptance / out of scope).

## Not run in this rehearsal

Full chapter-by-chapter click-through of all ten playbook chapters with narration; XLSX/DOCX/PDF
download verification in this browser; mobile widths (covered by Chrome AT-53 at 768/390/320).
