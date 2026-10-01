---
id: "VP-017"
title: "Complete the Microsoft setup wizard demonstration"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-017"]
modules: ["MOD-18"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:57+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-017 — Complete the Microsoft setup wizard demonstration

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing simulated resource tests, initial people/roles and skipped-setup local-work subcases.

## Bounded implementation / verification steps

1. Exercise start/back/cancel/review-summary and invalid tenant/site/library/root/sender/person choices.
2. Verify role mappings never implicitly create local access grants.
3. Retain proof that skipped setup/failed optional mail allows unrelated local jobs; fill only remaining original criteria.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-017, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-017)

Source action locators: `VP-017-E01`, `VP-017-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/M365SetupView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/M365SetupView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-18 — Microsoft 365 Integration](../../modules/MOD-18_Microsoft_365_Integration.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] liveConnected remains false in every supported scenario.
- [x] Cancel does not accidentally activate partially edited settings.
- [x] Verification refers to the exact current fixture revision.
- [x] All screens distinguish simulated setup from credentials/OAuth/provisioning.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 2e466d2 |
| Browser / viewport / build | Chrome E2E + M365SetupView wizard inspection |
| Persona and client/engagement / fixture | Admin persona walking the new multi-step setup wizard; cancel mid-flow |
| Exact original criterion and assertion | M365SetupView SetupStep wizard (start/skip/steps/back/cancel); cancel calls discardConfiguration and returns to the intro without saving; E2E 83/83 incl. AT-15/16 (per-capability simulation saved and retained on reload) and the wrong-tenant journey asserting liveConnected:false |
| Command / test / observed result | liveConnected forced false in every scenario (prototypeStore.ts:4357/4389/4399 + journey assertion); cancel never activates partial edits; verification results bind to the exact configRevision; every screen labels the flow simulated (no credentials/OAuth/provisioning) |
| Output or screenshot / hash | PASS - lint clean; 197/197 unit; 83/83 E2E at 2e466d2 |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
