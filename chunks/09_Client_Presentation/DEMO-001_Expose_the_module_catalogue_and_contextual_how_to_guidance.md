---
id: "DEMO-001"
title: "Expose the module catalogue and contextual how-to guidance"
status: "COMPLETED"
work_kind: "PROPOSED_UX"
priority: "P1"
source_status: "PROPOSED_PRESENTATION_WORK"
source_stories: ["VP-003", "VP-064"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: ["VP-003"]
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:22+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# DEMO-001 — Expose the module catalogue and contextual how-to guidance

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `PROPOSED_UX` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Proposed presentation work:** this is a recommended UX/rehearsal deliverable for the requested client demonstration, not an additional original product module or a claim that an existing feature failed. Parent VP criteria remain authoritative.

## Preserve and reuse

The existing 39 module definitions, Requirements view, role guide, Shell and module-specific screens.

## Bounded implementation / verification steps

1. Add a small client-friendly module catalogue or guide entry using the existing view system. Show purpose, current supported actions, role, prerequisites, example output and explicit simulation limits for each module.
2. Add context-sensitive “How to use this module” help from the 39 guides in this bundle, including input, steps, handoff and a recoverable error example. Reuse content; do not add a second requirements/status database.
3. Separate engineering coverage labels from client-facing capabilities. A Partial story may have a usable demonstrated path; unsupported actions must not look enabled.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-003, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-003)
- [VP-064, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-064)

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/RequirementsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/RequirementsView.tsx)
- [`src/components/layout/Shell.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/layout/Shell.tsx)
- [`ROLE_GUIDE.md`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/ROLE_GUIDE.md)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] All 39 original module IDs/names appear once in the catalogue, with their actual entry route or tab.
- [x] A user can open guidance, perform the intended operation, and return without losing selected context.
- [x] Every guide names the responsible role, required prior record and visible result, not just a feature description.
- [x] Only permitted business content is visible to client personas; internal implementation details are presenter-only.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `pack-work` (base `b24359c`) with DEMO-001 implementation |
| Browser / viewport / build | Live Chrome (IAB) at 1280×720 against the production build (`npm run build` → `vite preview`) |
| Persona and client/engagement / fixture | Engagement manager (Layla Rahman) and Finance contributor (Rami Nasser), full-practice |
| Exact original criterion and assertion | New `ModuleCatalogueView` (`module-guide` route) lists each of the 39 modules once (39 table rows, 39 Open buttons) with its workspace route, persona order, starting preset, how-to steps from the 39 pack guides, expected result, denial/rework example and (staff-only) residual-acceptance note. A context banner records the originating workspace with a Back button; selected client/engagement stay unchanged; every entry names roles, prior record (preset/route) and visible result |
| Command / test / observed result | Live Chrome: 39/39 rows and Open buttons verified; origin banner round-trip verified (opened from MOD-01, Back returns, context kept); role-scoped Open falls back safely without a bypass; client persona check: itinerary hidden, "Residual acceptance work" hidden, staff-only modules show a guided-session notice, simulation-honesty line visible — all PASS |
| Output or screenshot / hash | Screenshot in session artifacts; `docs/prototype/verification.md` 2026-09-25 (2) row; `tracking/ACCEPTANCE_EVIDENCE.md` DEMO-001/002 row; content distilled into `src/services/moduleGuideContent.ts` (no second requirements/status database) |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment; catalogue content is a distillation of the pack guides — engineering labels intentionally presenter-only |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
