---
id: "VP-020"
title: "Verify logical workspace preparation and shared document links"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-020"]
modules: ["MOD-10", "MOD-18"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:58+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-020 — Verify logical workspace preparation and shared document links

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Local canonical SharePoint hierarchy and document registration paths.

## Bounded implementation / verification steps

1. Rehearse accepted-client/configured-binding prerequisites and exact allowed root validation.
2. Prepare the same workspace twice and after a rename; demonstrate idempotent logical identity.
3. Compare library/job/PBC/workpaper links and independent library access to the same document.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-020, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-020)

Source action locators: `VP-020-E01`, `VP-020-E02`, `VP-020-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/DocumentsLibraryView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/DocumentsLibraryView.tsx)
- [`src/components/modules/M365SetupView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/M365SetupView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-10 — Document Management](../../modules/MOD-10_Document_Management.md)
- [MOD-18 — Microsoft 365 Integration](../../modules/MOD-18_Microsoft_365_Integration.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] One logical root exists per permitted client/binding operation.
- [x] Unavailable setup is described without attempting live provisioning.
- [x] All related views use the same document identity/revision.
- [x] A wrong root or foreign client cannot be linked.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 2e466d2 (extends 258733c evidence) |
| Browser / viewport / build | Chrome E2E + M365SetupView/accounting setup inspection |
| Persona and client/engagement / fixture | Admin persona configuring the simulated workspace; client_finance portal check |
| Exact original criterion and assertion | E2E AT-21 (OneDrive stays disabled until enabled; SharePoint remains canonical storage); AT-34 (accounting context persisted) |
| Command / test / observed result | One logical root per binding; unavailable setup described without provisioning; one document identity/revision across views; foreign root/client rejected |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-21 and AT-34; 2e466d2 adds prepareClientWorkspace (folders verified under the configured synthetic root, explicit no-provisioning notice) and document preview cross-links to the linked PBC request, workpaper and job; wrong-tenant/foreign-root linkage rejected (verificationResults bound to configRevision) |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
