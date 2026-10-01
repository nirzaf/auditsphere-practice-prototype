---
id: "VP-023"
title: "Complete request editing, reassignment and cancellation"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-023"]
modules: ["MOD-09"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:59+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-023 — Complete request editing, reassignment and cancellation

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing PBC draft/presentation/conversation/submission/review loop.

## Bounded implementation / verification steps

1. Compare original request criteria with existing edit/due date/owner/recipient/cancel controls; implement only absent required ones.
2. Rehearse recipient changes and cancellation after a submission; retain all response history and correct outstanding counts.
3. Test every filter and invalid/inactive/wrong-client recipient or missing context.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-023, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-023)

Source action locators: `VP-023-E01`, `VP-023-E02`, `VP-023-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ClientDetailView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ClientDetailView.tsx)
- [`src/components/modules/ClientPortalView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ClientPortalView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-09 — Client Requests / PBC](../../modules/MOD-09_Client_Requests_PBC.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Request edits retain identity, attribution and previous submissions.
- [x] Cancellation changes active counts without destroying files or acceptance history.
- [x] Only the currently permitted named contributor can perform contribution actions.
- [x] No automatic reminder, evidence acceptance or workflow engine is added.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `main` after VP-023 implementation (base includes parallel work `258733c`) |
| Browser / viewport / build | Suite run (headless Chrome E2E, Windows); UI verified by tsc build + unit-level store journeys |
| Persona and client/engagement / fixture | Manager (Layla Rahman) edits/cancels on ENG-26001; client_finance (Rami Nasser) as the named contributor uploading |
| Exact original criterion and assertion | New store commands `updatePbcRequest` (reason required; rejected for cancelled/accepted requests; no-op rejected; valid date enforced; internal thread entry with actor) and `cancelPbcRequest` (reason required; terminal; retains shared files, thread and acceptance history); UI: Edit/reassign modal and Cancel action on the Requests tab; contribution guard unchanged (only the named contributor uploads — `uploadPbcResponse` contributor check); no reminder/acceptance automation added |
| Command / test / observed result | `npm run lint` PASS; `npm run test:unit` 196/196 PASS incl. new `tests/unit/pbcRequestLifecycle.test.ts` (edit with thread entry; reason/no-op/date/cancelled rejections; cancel retains 1 shared file + history; double-cancel rejected; client role denied edit/cancel); `npm run test:e2e` run at this tree |
| Output or screenshot / hash | `e2e-vp023.log`; `tests/unit/pbcRequestLifecycle.test.ts`; `src/store/prototypeStore.ts` VP-023 section; `src/components/modules/ClientDetailView.tsx` |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment claim beyond the suite; edits after acceptance intentionally routed to follow-up requests so accepted evidence stays pinned |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
