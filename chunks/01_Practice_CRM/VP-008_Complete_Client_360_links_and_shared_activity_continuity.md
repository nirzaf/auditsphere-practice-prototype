---
id: "VP-008"
title: "Complete Client 360 links and shared activity continuity"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-008"]
modules: ["MOD-02", "MOD-17"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:53+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-008 — Complete Client 360 links and shared activity continuity

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

The 12-tab Client 360 workspace and shared communication projections already exist.

## Bounded implementation / verification steps

1. Exercise every existing tab’s primary action for at least two clients; record exact linked record/context.
2. Complete genuinely missing activity projections using shared IDs, not duplicated client/job/message records.
3. Verify return/back/filter restoration and no-access paths including records opened from global search.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-008, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-008)

Source action locators: `VP-008-E01`, `VP-008-R02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/ClientsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ClientsView.tsx)
- [`src/components/modules/ClientDetailView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/ClientDetailView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-02 — CRM & Client Management](../../modules/MOD-02_CRM_Client_Management.md)
- [MOD-17 — Search & Centralized Client View](../../modules/MOD-17_Search_Centralized_Client_View.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] All 12 existing tabs have honest empty, available and denied states.
- [x] Opening a child selects that exact record and retains its correct engagement.
- [x] The same activity has the same ID/content in Client 360 and its owning module.
- [x] Returning does not switch to a similar-named or previous client.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c |
| Browser / viewport / build | Chrome E2E + ClientDetailView inspection |
| Persona and client/engagement / fixture | Manager persona across two client workspaces; client_finance for entity re-scoping |
| Exact original criterion and assertion | E2E "VP-008-E01: preserves filtered portfolio and exact engagement context across two client workspaces"; AT-18 entity switch |
| Command / test / observed result | Child open selects exact record with correct engagement; returning preserves context; honest empty states |
| Output or screenshot / hash | PASS - 83/83 E2E incl. VP-008-E01 and AT-18 ("No shared documents available for this entity." re-scoping); Client 360 tabs carry counts and empty states |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
