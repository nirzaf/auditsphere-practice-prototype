---
id: "DEMO-002"
title: "Add a manual presenter walkthrough and role-handoff navigator"
status: "COMPLETED"
work_kind: "PROPOSED_UX"
priority: "P1"
source_status: "PROPOSED_PRESENTATION_WORK"
source_stories: ["VP-003", "VP-004", "VP-064"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: ["DEMO-001", "VP-004"]
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:25+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# DEMO-002 — Add a manual presenter walkthrough and role-handoff navigator

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `PROPOSED_UX` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Proposed presentation work:** this is a recommended UX/rehearsal deliverable for the requested client demonstration, not an additional original product module or a claim that an existing feature failed. Parent VP criteria remain authoritative.

## Preserve and reuse

The six existing scenario presets and real persona/engagement selectors; no new workflow engine.

## Bounded implementation / verification steps

1. Extend the existing presenter controls with a manual itinerary: current module, next step, required role/context and expected outcome. Link to actual screens instead of scripting business approvals.
2. Use the playbook paths for practice acquisition, PBC, accounting, audit, economics and the supported group demonstration. Provide a small checkpoint reminder and “resume here” instructions.
3. Before scenario changes, confirm destructive reset and honor existing dirty-form guards. Role changes remain explicit and must never manufacture an independent decision or grant.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-003, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-003)
- [VP-004, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-004)
- [VP-064, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-064)

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/layout/Shell.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/layout/Shell.tsx)
- [`src/store/scenarios.ts`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/scenarios.ts)
- [`src/App.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/App.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] A presenter can navigate the full itinerary without guessing route names or the next required role.
- [x] Next/Back changes guidance only unless the presenter deliberately selects the existing navigation control.
- [x] Reset/reload limitations and browser-local file availability are visible before switching scenarios.
- [x] A blocked or denied action points to the unmet prerequisite and a legitimate next step, never a bypass button.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `pack-work` (base `b24359c`) with DEMO-002 implementation |
| Browser / viewport / build | Live Chrome (IAB) at 1280×720 against the production build (`npm run build` → `vite preview`) |
| Persona and client/engagement / fixture | Engagement manager (Layla Rahman), full-practice; presenter-only panel hidden for client personas |
| Exact original criterion and assertion | Manual 10-chapter itinerary (from the client-demo playbook) inside ModuleCatalogueView: each chapter names its preset, role order, module links, visible outcome and a checkpoint note ("note this step number before closing the demo — the tour resumes here on this browser", persisted under a presenter-only storage key). Next/Back change the highlighted guidance only; opening a workspace always uses the real navigation (and its dirty-form guard). Reset/reload limitations: the itinerary points to the existing scenario chooser (whose reset keeps a recovery backup after confirm) and the page states the demo is browser-local; role changes stay explicit in the persona selector |
| Command / test / observed result | Live Chrome: Step 1 → Next chapter shows "Step 2 of 10" with chapter 2 guidance while staying on the guide page; "Open first workspace of this chapter" navigates through the real guard — a manager opening the relationship-role acquisition route falls back safely with context intact (no bypass); role handoffs are named per chapter and never scripted. PASS |
| Output or screenshot / hash | Screenshot in session artifacts; `docs/prototype/verification.md` 2026-09-25 (2) row; `tracking/ACCEPTANCE_EVIDENCE.md` DEMO-001/002 row |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment; the full client agenda rehearsal itself remains DEMO-004 (not yet run) |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
