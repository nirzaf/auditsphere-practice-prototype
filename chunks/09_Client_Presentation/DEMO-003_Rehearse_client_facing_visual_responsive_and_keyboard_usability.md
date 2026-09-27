---
id: "DEMO-003"
title: "Rehearse client-facing visual, responsive and keyboard usability"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "PROPOSED_PRESENTATION_WORK"
source_stories: ["VP-003", "VP-063", "VP-064"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: ["VP-003"]
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:23+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# DEMO-003 — Rehearse client-facing visual, responsive and keyboard usability

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Proposed presentation work:** this is a recommended UX/rehearsal deliverable for the requested client demonstration, not an additional original product module or a claim that an existing feature failed. Parent VP criteria remain authoritative.

## Preserve and reuse

The current visual system, responsive tables, dialog focus handling and existing accessibility controls.

## Bounded implementation / verification steps

1. Run every client-demo path at a normal laptop viewport, a projector-friendly desktop viewport and a narrow browser viewport. Record real clipping, wrapping, contrast or target-size problems before editing CSS.
2. Exercise keyboard-only navigation, Enter/Escape, focus return, zoom and status/error announcements. Verify long names, amounts, empty lists and supported error states.
3. Apply only measured presentation fixes using existing styles/components; preserve readable labels, currency/date context and historical/simulated indicators.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-003, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-003)
- [VP-063, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-063)
- [VP-064, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-064)

Candidate touchpoints (inspect current ownership before editing):

- [`src/App.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/App.tsx)
- [`src/components/layout/Shell.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/layout/Shell.tsx)
- [`styles.css`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/styles.css)
- [`roles.css`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/roles.css)
- [`tests/e2e/app.test.ts`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/tests/e2e/app.test.ts)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] All 39 module guides receive a visual/keyboard observation or a clearly recorded not-run result.
- [x] Primary actions and context remain visible at the recorded viewports; table scrolling is intentional and usable.
- [x] No modal traps a keyboard user or loses meaningful focus after save/cancel/error.
- [x] Screenshots demonstrate the actual source build and synthetic scenario; responsive web is not called a native mobile app.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `pack-work` (base `b24359c`) with VP-003/VP-048/DEMO changes |
| Browser / viewport / build | Live Chrome (IAB) at 1280×720 and 390×844 against the production build (`npm run build` → `vite preview`) |
| Persona and client/engagement / fixture | Engagement manager (Layla Rahman) on full-practice; Finance contributor (Rami Nasser) for the client-persona check |
| Exact original criterion and assertion | Keyboard: Escape on the shared unsaved-changes dialog closes it and keeps the draft; 6/6 synthetic Tab presses stay inside `.modal-backdrop .modal`; Discard-and-continue navigates. Visual: Module Guide catalogue renders all 39 rows with 39 Open buttons; planning thresholds update from deliberately typed benchmark. Responsive: 390px layout stacks (hamburger, stacked context bar) with no horizontal overflow |
| Command / test / observed result | Live Chrome rehearsal PASS for all above; individual module workspace keyboard observations are recorded NOT RUN (module demos remain NOT_RUN in `tracking/MODULE_DEMO_SIGNOFF.md`) — the catalogue-level visual observation covered all 39 module rows |
| Output or screenshot / hash | Screenshots in session artifacts (guide page, unsaved-changes dialog, 390px layout); `tracking/ACCEPTANCE_EVIDENCE.md` DEMO-003 row |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; browser-web at two viewports only — not a native mobile app; no deployment |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
