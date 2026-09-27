---
id: "VP-010"
title: "Close reusable service content and proposal drafting gaps"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-010"]
modules: ["MOD-04"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:53+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-010 — Close reusable service content and proposal drafting gaps

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Working proposal draft/review/presentation and currency arithmetic.

## Bounded implementation / verification steps

1. Compare catalogue and reusable proposal-content editors with original VP-010 fields before creating additional UI.
2. Fill only missing service/fee/terms/branding controls required by the contract; reuse existing administration/catalogue records.
3. Rehearse revise/return/edit/redisplay while preserving prior presented content.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-010, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-010)

Source action locators: `VP-010-E01`, `VP-010-E02`, `VP-010-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ProposalsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ProposalsView.tsx)
- [`src/components/modules/EngagementsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/EngagementsView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-04 — Proposals & Engagements](../../modules/MOD-04_Proposals_Engagements.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Proposal scope, line quantities/rates/currencies and totals reconcile.
- [x] Previously presented versions remain unchanged after a new draft.
- [x] Unsupported services cannot enter client-facing proposal choices.
- [x] A branded preview describes a synthetic proposal, not an electronic signature or delivered contract.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c |
| Browser / viewport / build | Chrome E2E + ProposalsView/saveProposalService|Template inspection |
| Persona and client/engagement / fixture | Relationship persona authoring proposals; independent reviewer returning one |
| Exact original criterion and assertion | E2E "VP-010-E01: authors reusable service/template defaults and prints a complete branded proposal preview"; "AT-58/VP-010-E02: returns, revises and redisplays a proposal without rewriting the earlier presented snapshot" |
| Command / test / observed result | Totals reconcile; earlier presented snapshot unchanged; branded preview describes a synthetic proposal only |
| Output or screenshot / hash | PASS - 83/83 E2E incl. both VP-010 journeys; services/templates revision-guarded in store; preview labelled as prototype output |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
