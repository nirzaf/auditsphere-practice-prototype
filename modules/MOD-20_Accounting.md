# MOD-20 — Accounting

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `accounting-setup`  
**Component owner:** `AccountingWorkbenchView`  
**Persona sequence:** permitted accounting preparer → independent reviewer  
**Starting scenario:** `accounting-only`  
**Source stories:** VP-034, VP-037

## What already exists

Profiles, chart/period/book/dimension editors and independently reviewed versioned account mappings exist; mapping VP-037 is reported verified.

## Remaining work / demonstration limit

Finish wider setup edits and downstream stale/rework across same-client periods.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Accounting Workbench for ENG-26002 and inspect client/entity, basis, currency, period and book.
2. Review the posting chart and the bounded dimension list — Department, Cost centre and Project, each with an active flag and an optional value set (an empty set accepts any bounded value).
3. Create a valid profile/chart revision, retaining previous context.
4. Map accepted TB accounts to statement lines and review independently.
5. Change an affected chart/context and inspect stale mappings/statements/packages before reapproval.

## Expected client-visible outcome

One client reporting context is preserved across imports and outputs; no operational ERP or new ledger is created.

## Failure / denial / rework example

Closed books, chart cycles, wrong-client references and invalid dimensions cannot silently alter approved output. GL intake rejects a dimension that is not configured and active on the selected profile, or a value outside its configured set, before any source row or revision is created; already-imported history is never rewritten.

## Implementation closure tasks

- [VP-034 — Finish accounting-context edits and downstream rework](../chunks/05_Accounting/VP-034_Finish_accounting_context_edits_and_downstream_rework.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-20) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
