---
id: "VP-003"
title: "Complete cross-module form, context and navigation safeguards"
status: "COMPLETED"
work_kind: "IMPLEMENT_OR_VERIFY"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-003"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: ["VP-002"]
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:19+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-003 — Complete cross-module form, context and navigation safeguards

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `IMPLEMENT_OR_VERIFY` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing focus trap/Escape handling, shell context chooser and Client Detail/M365 dirty-form registration.

## Bounded implementation / verification steps

1. Inventory forms by route and register remaining genuinely unguarded dirty forms with the existing UnsavedFormGuard; avoid a new form framework.
2. Exercise Save/Discard/Stay on route, persona, engagement, client and search-target changes. Ensure cancelled or rejected saves keep the user and draft in context.
3. Rehearse modal-specific Enter/Escape, focus return and unavailable/direct-target recovery. Measure rather than assume browser back/forward support.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-003, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-003)

Source action locators: `VP-003-E01`, `VP-003-E02`, `VP-003-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/App.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/App.tsx)
- [`src/services/unsavedFormGuard.ts`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/services/unsavedFormGuard.ts)
- [`src/components/layout/Shell.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/layout/Shell.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Every edited form either uses the guard or has an explicitly documented safe immediate-save behavior.
- [x] Changing persona/engagement never submits a previous context’s draft or leaks its visible details.
- [x] Keyboard submit/cancel has one outcome, correct focus restoration and clear field errors.
- [x] A denied/stale target provides a safe explanation and route back without data loss.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Working tree on `pack-work` (base `b24359c`) with VP-003 changes applied |
| Browser / viewport / build | Headless Chrome E2E (Windows) + live Chrome rehearsal at 1280×720 |
| Persona and client/engagement / fixture | Manager (Layla Rahman) on ENG-26001; client selector and route-denial checks |
| Exact original criterion and assertion | Inventory result: inline dirty forms in AuditRisksProgramsView (risk/template/fieldwork drafts), AccountingWorkbenchView (reconciliation draft, TB balance edit, reflection-evidence drafts), AccountingSetup, TBImportWizard staging and AuditPlanningView now register the existing `UnsavedFormGuard`; App uses a keyed registry; the sidebar client switch goes through the guard (previously bypassed it). Modal-bounded forms (Budgets editor, job/task/engagement/finding/receivable/billing/communication/portal dialogs) documented as safe discard-on-close; immediate-save controls (reflection status select, procedure status selects) commit directly |
| Command / test / observed result | `npm run lint` PASS; `npm run test:unit` 172/172 PASS; `npm run test:e2e` 74/74 PASS (VP-049 and AT-38 journeys traverse the newly guarded views). Live rehearsal: Escape on the dirty-planning dialog keeps the draft; 6/6 Tab presses stay inside the dialog; Discard navigates; a manager opening the role-restricted acquisition route falls back safely with client/engagement context intact (no bypass) |
| Output or screenshot / hash | `e2e-final.log` (74/74); `docs/prototype/verification.md` 2026-09-25 (2) row; `tracking/ACCEPTANCE_EVIDENCE.md` VP-003 rows; tracker VP-003-E01/E02/R03 checked |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment. Also fixed en route: latent hooks-after-conditional-return bug in AccountingWorkbenchView; committed reflection-evidence drafts now clear so saved evidence is not treated as pending |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
