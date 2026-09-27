---
id: "VP-012"
title: "Finish engagement-change impact and lifecycle rework"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-012"]
modules: ["MOD-04"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:54+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-012 — Finish engagement-change impact and lifecycle rework

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing creation/activation, team/service/period edits and reasoned suspend/resume/cancel/close.

## Bounded implementation / verification steps

1. Create a change-impact matrix for team, service, period, fee and scope across plans/procedures/statements/evidence/approvals/packages.
2. Verify each affected revision is stale/reassessed only when relevant and historical outputs remain preserved.
3. Complete cross-view and reload checks for terminal states without introducing task generation or automatic renewal.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-012, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-012)

Source action locators: `VP-012-E01`, `VP-012-E02`, `VP-012-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ProposalsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ProposalsView.tsx)
- [`src/components/modules/EngagementsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/EngagementsView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-04 — Proposals & Engagements](../../modules/MOD-04_Proposals_Engagements.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Inactive professional work is blocked while specifically permitted billing/archive remains accessible.
- [x] Changed source/scope cannot retain a misleading current approval.
- [x] Cancelled/closed engagements remain terminal and history is visible after reload.
- [x] No future jobs, grants, approvals or invoices are auto-created.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c |
| Browser / viewport / build | Chrome E2E + engagement lifecycle store inspection |
| Persona and client/engagement / fixture | Partner/manager suspending and resuming ENG-26001; cancelled engagement fixture |
| Exact original criterion and assertion | E2E "VP-012: suspends and resumes an engagement with reasoned persisted history"; committed cancelled-engagement reload journeys |
| Command / test / observed result | Inactive work blocked; terminal stays terminal; history visible after reload; no auto-creation |
| Output or screenshot / hash | PASS - 83/83 E2E incl. VP-012 journey; cancelled engagements remain terminal across reload (recorded journey) |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
