---
id: "VP-030"
title: "Close invoice-source, ad-hoc line and reservation behavior"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-030"]
modules: ["MOD-14"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:04+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-030 — Close invoice-source, ad-hoc line and reservation behavior

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Approved-time and accepted fixed-fee sources, exact rates and proposal-level fee caps already work.

## Bounded implementation / verification steps

1. Verify billing account/contact, arbitrary allowed ad-hoc lines and editable drafts against original fields.
2. Exercise duplicate reservation, cancelled-draft release and source revision mismatch.
3. Resolve whether per-service allocation is a contractual gap; do not invent milestone scheduling to fill a descriptive limitation.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-030, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-030)

Source action locators: `VP-030-E01`, `VP-030-R02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/BillingInvoicingView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/BillingInvoicingView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-14 — Billing & Invoicing](../../modules/MOD-14_Billing_Invoicing.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Line arithmetic, currency and total reconcile to exact supported sources.
- [x] Draft cancellation frees only its eligible reserved sources; issued history remains immutable.
- [x] Unapproved/nonbillable/stale/foreign/over-contract sources are rejected.
- [x] No source is billed twice and no tax/payment engine is introduced.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c |
| Browser / viewport / build | Chrome E2E + invoice source guards inspection |
| Persona and client/engagement / fixture | Manager drafting invoices from eligible sources; billing persona |
| Exact original criterion and assertion | cancelInvoiceDraft guards (guards.test.ts:1640-1649); E2E AT-51 and AT-31/VP-031 |
| Command / test / observed result | Line arithmetic/currency/totals reconcile to supported sources; draft cancellation frees only eligible reservations; issued history immutable; unapproved/foreign/over-contract sources rejected; no double billing |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-51 ("saves a new rate version without rewriting issued invoices") and AT-31/VP-031; unit tests assert cancelled-draft limits and issued immutability |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
