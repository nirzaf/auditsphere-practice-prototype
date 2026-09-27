---
id: "VP-044"
title: "Close component pins, FX traceability and replacement re-review"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-044"]
modules: ["MOD-26"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:11+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-044 — Close component pins, FX traceability and replacement re-review

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Exact package review/basis/period guards, explicit re-pin and QAR 0.01 rounding-residual fixture have recorded coverage.

## Bounded implementation / verification steps

1. Map each remaining original criterion to existing compatibility, old/new pin and rounding evidence; do not recreate the already-added group artifact.
2. Exercise component replacement and stale pin→explicit re-pin→fresh review in the supported two-entity profile.
3. Explain dated rates and unallocated rounding differences without invented plugs or live feeds.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-044, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-044)

Source action locators: `VP-044-E01`, `VP-044-E02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ConsolidationView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ConsolidationView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-26 — Consolidation](../../modules/MOD-26_Consolidation.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Component revision, source rows, period, basis and review identity match exactly.
- [x] Old pins remain historical and never silently follow a newer source.
- [x] Original/translated amounts and per-line rounding are traceable with explicit currency.
- [x] Unsupported FX methods and incomplete evidence stay blocked; component books remain unchanged.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c + committed base |
| Browser / viewport / build | Chrome E2E + consolidation perimeter inspection |
| Persona and client/engagement / fixture | Manager editing group perimeter and FX rate; component replacement fixture |
| Exact original criterion and assertion | E2E "AT-43: edits the group perimeter with validation, history, elimination re-review and revert"; "AT-44: warns on a changed component source and requires an explicit re-pin"; "AT-44: isolates a translation-rounding residual"; FX lineage journeys |
| Command / test / observed result | Component revision/source/period/basis/review identity match exactly; old pins stay historical; per-line rounding traceable with currency; unsupported FX methods blocked; component books unchanged |
| Output or screenshot / hash | PASS - 83/83 E2E incl. the AT-43/AT-44 perimeter, re-pin and rounding-residual journeys; FX lineage preserved in group output exports |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
