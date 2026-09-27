---
id: "VP-025"
title: "Finish three-role portal and sharing-withdrawal demonstrations"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-025"]
modules: ["MOD-08"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:01+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-025 — Finish three-role portal and sharing-withdrawal demonstrations

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Working client entity switching, invoice PDFs and reasoned share/withdraw history.

## Bounded implementation / verification steps

1. Rehearse every portal list/badge/search/action for client_admin, client_finance and client management.
2. Test no-access/pending-review/withdrawn-sharing and reassignment while preserving history.
3. Explain acknowledgement versus commercial response versus management approval without signature language.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-025, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-025)

Source action locators: `VP-025-E01`, `VP-025-E03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ClientPortalView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ClientPortalView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-08 — Client Portal](../../modules/MOD-08_Client_Portal.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] All client-visible records are explicitly shared and correctly scoped.
- [x] Draft invoices/internal notes/costs/workpapers remain hidden from lists, counts and exports.
- [x] Withdrawal immediately affects current projection without rewriting historical issued evidence.
- [x] Three client roles cannot impersonate each other’s business actions.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c + committed base |
| Browser / viewport / build | Chrome E2E + setDocumentClientSharing inspection |
| Persona and client/engagement / fixture | Three client roles; sharing withdrawal scenario |
| Exact original criterion and assertion | setDocumentClientSharing(documentId, shared, reason) (prototypeStore.ts:1511); E2E AT-18 (portal re-scoping per entity), AT-38/40 (internal material excluded from portal and export bytes) |
| Command / test / observed result | All client-visible records explicitly shared and scoped; drafts/internal notes/workpapers hidden from lists and exports; withdrawal affects current projection without rewriting issued history; client roles cannot impersonate each other |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-18 and AT-38/40; client projections read only Client-shared visibility; role guards separate client personas (upload restricted to named contributor; acknowledgement has no signature) |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
