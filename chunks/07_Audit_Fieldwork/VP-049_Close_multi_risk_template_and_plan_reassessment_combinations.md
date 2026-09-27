---
id: "VP-049"
title: "Close multi-risk, template and plan-reassessment combinations"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-049"]
modules: ["MOD-29"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:14+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-049 — Close multi-risk, template and plan-reassessment combinations

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Risk editing/reciprocal links, template publish/apply/revise/retire and plan return/rework already exist.

## Bounded implementation / verification steps

1. Complete multiple risks affecting one/many procedures across repeated changes.
2. Rehearse reviewer return/reopen and independently approved replacement plans while old snapshots remain.
3. Verify required reassessment prevents procedure submission and old template application never mutates retrospectively.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-049, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-049)

Source action locators: `VP-049-E01`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/AuditRisksProgramsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AuditRisksProgramsView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-29 — Risks & Audit Programs](../../modules/MOD-29_Risks_Audit_Programs.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Risk↔procedure links remain reciprocal and scoped.
- [x] Each material change retains attributed impact and a new applicable plan revision.
- [x] Applied template snapshots retain their exact source revision after template edits/retirement.
- [x] Unresolved gaps/reassessment are visible and cannot be cleared by role switching.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c + committed base |
| Browser / viewport / build | Chrome E2E + risk register inspection |
| Persona and client/engagement / fixture | Manager editing risks and links; applying a published template |
| Exact original criterion and assertion | E2E "VP-049: edits the persisted risk register and keeps procedure links reciprocal" (plan supersede + reassessment), "VP-049: publishes and applies a reusable program template with fresh execution state" |
| Command / test / observed result | Multi-risk/template/plan-reassessment combinations: risk edit supersedes the approved plan and gates re-approval; reciprocal risk/procedure links enforced; template application starts fresh execution state |
| Output or screenshot / hash | PASS - 83/83 E2E incl. both VP-049 journeys; the risk-driven plan revision requires independent review before the gate reopens |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
