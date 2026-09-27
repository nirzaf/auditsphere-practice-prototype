---
id: "VP-019"
title: "Close professional-role, expiry and group-scope demonstrations"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-019"]
modules: ["MOD-19", "MOD-39"]
depends_on: []
owner: "M.F.M Fazrin"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:57+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-019 — Close professional-role, expiry and group-scope demonstrations

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing local identity/invite lifecycle, dated grants and tested cross-tab revocation/expiry handling.

## Bounded implementation / verification steps

1. Complete professional/management approval-request evidence and compatible-role changes.
2. Exercise narrow group/component and multi-grant cases across routes, dialogs, counts, choices, exports and commands.
3. Preserve same-natural-person separation of duties even across two persona entries.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-019, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-019)

Source action locators: `VP-019-E01`, `VP-019-E02`, `VP-019-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/AdministrationView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AdministrationView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-19 — Identity & Access Management](../../modules/MOD-19_Identity_Access_Management.md)
- [MOD-39 — Administration](../../modules/MOD-39_Administration.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Administrative/persona selection alone cannot grant professional approval.
- [x] Expired/revoked scope removes current projections and rejects stale commands.
- [x] Relationship groups never confer component/client access.
- [x] Each grant decision/history keeps evidence reference, actor, reason and effective window.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c |
| Browser / viewport / build | Chrome E2E + grantAccess/invitation store inspection |
| Persona and client/engagement / fixture | Admin persona granting scoped access; expired/revoked grant fixtures |
| Exact original criterion and assertion | grantAccess with effectiveFrom/expiresAt/evidence refs (prototypeStore.ts:514); E2E AT-17/VP-018 (identity without access, disable, invitation history) |
| Command / test / observed result | Persona selection alone grants nothing; expired/revoked scope stops projections and rejects stale commands; groups confer no access; grants carry evidence/actor/reason/window |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-17/VP-018; identity mapping journey asserts mapping creates no authorization grant; role grants checked by requireRole/requireGlobalAdmin on every command |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
