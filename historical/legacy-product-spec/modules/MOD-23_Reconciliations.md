# MOD-23 — Reconciliations

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `accounting-setup (reconciliations)`  
**Component owner:** `AccountingWorkbenchView`  
**Persona sequence:** preparer → independent reviewer  
**Starting scenario:** `accounting-only`  
**Source stories:** VP-039

## What already exists

Revisioned source-pinned schedules, typed timing/correction items, reasoned return and residual checks exist.

## Remaining work / demonstration limit

Close missing-evidence/correction-link and replacement-stale visibility cases, not live bank integration.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open a reconciliation schedule and select the exact scoped source/evidence revisions.
2. Enter source balances and dated timing items separately from proposed corrections.
3. Calculate and inspect the explained and unexplained residual.
4. Submit to an independent reviewer, return with a reason, then create a rework revision.
5. Replace an input and compare the stale current schedule with its retained approved predecessor; open the stale schedule through its rework action to re-pin it to the current source revision, which returns it to draft for independent reapproval.

## Expected client-visible outcome

The source fixture $999,900 plus $100 timing reconciles to $1,000,000; keep currency labels explicit and do not mix it with QAR fixtures.

## Failure / denial / rework example

A nonzero unexplained residual, absent evidence or an unlinked proposed correction blocks approval.

## Implementation closure tasks

- [VP-039 — Finish reconciliation evidence and stale-snapshot demonstrations](../chunks/05_Accounting/VP-039_Finish_reconciliation_evidence_and_stale_snapshot_demonstrations.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-23) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
