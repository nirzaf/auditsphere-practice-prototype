# MOD-22 — Adjustments & Journals

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `accounting-setup (adjustments) → portal approvals`  
**Component owner:** `AccountingWorkbenchView / ClientPortalView`  
**Persona sequence:** preparer → independent technical reviewer → client management  
**Starting scenario:** `accounting-only`  
**Source stories:** VP-038

## What already exists

Balanced journals, separate technical/management review, reflection evidence and amendment history exist. A journal may additionally pin the exact supporting evidence (with its document), workpaper and finding revisions; those pins are re-checked when the journal is proposed, technically approved, accepted by management and recorded as included in reporting.

## Remaining work / demonstration limit

Complete the browser rehearsal of the full rejected/reflected replacement-source and support-linkage matrix (foreign, unavailable, superseded and stale pins across evidence, workpaper and finding); the controls exist and are unit/Chrome tested in bounded combinations.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Draft a balanced reporting adjustment and, in the optional supporting-records block, select the in-scope evidence, workpaper and finding. Choices are limited to this engagement; unavailable, non-applicable or superseded records appear disabled, and the saved journal shows the exact revisions it pinned.
2. Submit and obtain a different person’s technical review.
3. Switch to authorized client management and record the separate decision.
4. Set the evidence-backed reflection state against the exact TB source, then record reporting inclusion.
5. Inspect statement impact, then replace the TB source or advance a linked record's revision and show the stale support warning, the prior pins retained in amendment history, and the fresh reapproval the journal now needs.

## Expected client-visible outcome

For the dedicated depreciation fixture assets move 23,000→22,500 and profit 3,000→2,500 once; no real ledger posting occurs.

## Failure / denial / rework example

Partial/Unknown reflection blocks relevant final output; an already-reflected adjustment must not be charged twice. A journal whose pinned evidence, workpaper or finding is foreign, superseded or behind the current revision is refused at approval and is excluded from statements and packages with an explicit “Journal support needs review” reason until it is re-pinned and independently re-reviewed.

## Implementation closure tasks

- [VP-038 — Finish adjustment reflection and evidence-linked correction paths](../chunks/05_Accounting/VP-038_Finish_adjustment_reflection_and_evidence_linked_correction_paths.md)

All modules also use [VP-003 shared forms/navigation](../chunks/00_Foundation/VP-003_Complete_cross_module_form_context_and_navigation_safeguards.md) and [DEMO-004 final rehearsal](../chunks/09_Client_Presentation/DEMO-004_Complete_the_client_demo_preflight_rehearsal_and_handoff.md).

## Rehearsal evidence to capture

| Step | Expected | Observed / evidence |
|---|---|---|
| Entry and role/context | Correct permitted client/engagement and instructions | Not run |
| Main action and output | Outcome above; genuine supported file where applicable | Not run |
| Handoff / independent actor | Separate person; correct version | Not run / N/A with reason |
| Denial or rework | Explicit failure without data loss or bypass | Not run |
| Reload / return | Coherent record/history and context | Not run |

Record the final result in [module-demo signoff](../tracking/MODULE_DEMO_SIGNOFF.md). “Demonstrated” is a bounded prototype result, not a production or professional assurance claim.

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-22) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
