---
id: "VP-048"
title: "Complete deliberate materiality inputs and truthful planning feedback"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-048"]
modules: ["MOD-28"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:13+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-048 — Complete deliberate materiality inputs and truthful planning feedback

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing planning tabs, versioned plans and independent review; calculateMateriality already supports optional assumptions.

## Bounded implementation / verification steps

1. Expose/store the originally required independent performance/trivial assumptions and source/benchmark rationale using existing bounded fields/helper; confirm the full component before editing.
2. Remove or clearly mark prefilled illustrative team/milestone/approval wording. Validate actual eligible people and entered dates; preserve valid zero/blank distinctions instead of falling back through ||.
3. Correct review feedback: the current handler says “gate cleared” for both approve and return; make messages match actual saved gate state. Rehearse context switches while drafts exist.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-048, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-048)

Source action locators: `VP-048-E01`, `VP-048-E03`, `VP-048-R02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/AuditPlanningView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AuditPlanningView.tsx)
- [`src/services/calculations.ts`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/services/calculations.ts)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-28 — Audit Planning](../../modules/MOD-28_Audit_Planning.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Entered overall/performance/trivial assumptions produce deterministic values and survive a new plan revision.
- [x] No benchmark, team assignment, completed milestone or professional approval is invented from a default.
- [x] Returned plan remains blocked/Under review as appropriate and never announces a cleared gate.
- [x] Changed approved assumptions identify dependent fieldwork/conclusions for fresh human review.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `pack-work` (base `b24359c`), VP-048 changes applied |
| Browser / viewport / build | Headless Chrome E2E (Windows) + live Chrome rehearsal at 1280×720 |
| Persona and client/engagement / fixture | Engagement manager (Layla Rahman), ENG-26001, `full-practice`; reviewer Sara Malik for plan review |
| Exact original criterion and assertion | Deliberate inputs: benchmark starts empty (client revenue as labelled reference only), rationale and reviewer notes start empty and are required, performance % and trivial % are separate inputs passed to `calculateMateriality`, team/milestones start empty with editable add/remove rows, significant areas replace the hard-coded array. Truthful feedback: approval clears the gate for that version; return keeps the gate open and requires recorded reasons |
| Command / test / observed result | `npm run lint` PASS; `npm run test:unit` 172/172 PASS; `npm run test:e2e` 74/74 PASS with the VP-049 journey updated to enter assumptions deliberately (store always required review notes — the old prefill masked it); returned plan status 'Draft' asserted by the existing journey; live Chrome: typing a benchmark updates thresholds immediately; saving without rationale shows the explicit field error |
| Output or screenshot / hash | `e2e-final.log` (74/74); `docs/prototype/verification.md` 2026-09-25 (2) row; `tracking/ACCEPTANCE_EVIDENCE.md` VP-048 row; tracker VP-048-E01/R02/E03 checked |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment; threshold rates default to the previously hard-coded 75%/5% as visible editable values (not asserted as professional recommendations) |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
