---
id: "VP-062"
title: "Verify prospective firm settings and editor ownership"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-062"]
modules: ["MOD-39"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:16+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-062 — Verify prospective firm settings and editor ownership

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Current Firm Administration settings and dedicated business editors.

## Bounded implementation / verification steps

1. Check each supported setting is actually consumed by the intended new form/preview.
2. Test numbering collisions, missing logo, defaults, invalid values and stale revisions.
3. Reconcile catalogue/template ownership with dedicated screens; do not add duplicate settings stores or excluded toggles.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-062, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-062)

Source action locators: `VP-062-E01`, `VP-062-E02`, `VP-062-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/AdministrationView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/AdministrationView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-39 — Administration](../../modules/MOD-39_Administration.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Settings affect new records prospectively with attribution.
- [x] Issued invoices, released artifacts and template-derived jobs retain their historic content.
- [x] Invalid or colliding settings produce actionable errors without partial changes.
- [x] System settings do not confer professional powers or enable excluded products.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c |
| Browser / viewport / build | Chrome E2E + AdministrationView/grantAccess inspection |
| Persona and client/engagement / fixture | System administrator editing firm settings and access windows |
| Exact original criterion and assertion | grantAccess effective windows with request/approval evidence refs; AdministrationView grant history table (actor, window, request, approval evidence, reason); AT-51/AT-13/AT-19 journeys for historic content retention |
| Command / test / observed result | Settings affect new records prospectively with attribution; issued invoices, released artifacts and template-derived jobs keep historic content; invalid/colliding settings error without partial change; settings confer no professional powers or excluded products |
| Output or screenshot / hash | PASS - 83/83 E2E supporting journeys (AT-51/13/19); grant changes require Global-admin role (requireGlobalAdmin) and record actor/attribution; scope exclusion audit (VP-001) confirms no excluded-product controls |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
