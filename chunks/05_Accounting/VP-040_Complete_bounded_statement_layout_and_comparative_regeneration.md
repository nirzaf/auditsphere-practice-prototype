---
id: "VP-040"
title: "Complete bounded statement layout and comparative regeneration"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-040"]
modules: ["MOD-24"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:09+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-040 — Complete bounded statement layout and comparative regeneration

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Current/prior mapped statements, saved revisions, approved inputs and cash/equity schedule support already exist.

## Bounded implementation / verification steps

1. Compare the original layout/group/order/subtotal contract to the actual supported controls; fill only real missing bounded layout operations.
2. Run current-source, mapping, prior-period and layout change combinations with deterministic subtotals.
3. Expose unsupported component-equity detail as unavailable unless the original supported fixture supplies sufficient approved data; coordinate schedules/notes with VP-041.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-040, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-040)

Source action locators: `VP-040-E01`, `VP-040-E03`, `VP-040-R02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/FinancialStatementsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/FinancialStatementsView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-24 — Financial Statements](../../modules/MOD-24_Financial_Statements.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Each statement line/subtotal has exact source-account and mapping lineage.
- [x] Missing or unreviewed comparatives never become zero or a misleading valid comparison.
- [x] A changed input/layout stales saved review and requires a new revision.
- [x] UI and genuine output agree for the supported fixture; no generic accounting rule engine is added.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c + committed base |
| Browser / viewport / build | Chrome E2E + FinancialStatementsView inspection |
| Persona and client/engagement / fixture | Preparer generates statements; reviewer approves mapping; comparative fixture |
| Exact original criterion and assertion | E2E "AT-37: independently approves account mappings and traces statement rows to their source accounts"; statement generation from mapped TB with declared basis |
| Command / test / observed result | Line/subtotal lineage to source accounts and mappings; missing comparatives never become zero; changed inputs stale saved review and require a new revision; no generic rule engine |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-37; statement rows render with source-account lineage and stale-review handling on changed inputs |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
