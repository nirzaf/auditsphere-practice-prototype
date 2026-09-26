# MOD-21 — Trial Balance & GL

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `accounting-setup (TB and GL areas)`  
**Component owner:** `AccountingWorkbenchView / import components`  
**Persona sequence:** preparer  
**Starting scenario:** `accounting-only`  
**Source stories:** VP-035, VP-036

## What already exists

Genuine CSV/XLSX TB imports are reported verified; bounded mapped GL imports, immutable revisions and tie-out exist. GL lines keep the mapped posting date plus optional service date and Department/Cost centre/Project dimension values, and the scoped GL export reproduces them.

## Remaining work / demonstration limit

Complete remaining original-control, partial-batch/replacement, source-review and output-staleness paths.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open the TB import panel in Accounting Workbench; select the scoped chart/book.
2. Import a genuine synthetic CSV/XLSX, map headers and inspect preview/control totals.
3. Commit a valid source; compare accepted revision/hash with predecessor history.
4. Map a nonstandard GL header: the nine required fields plus optional opening balance, service date and the three dimension columns. Every mapped field must point at a different source column, and the preview must show row-level errors without committing.
5. Inspect opening + movement = closing by account, drill into one journal, filter by account, and export the filtered CSV — it carries posting date, service date and dimension values per line.

## Expected client-visible outcome

Imported client sources are immutable; a successful preview is not a committed or professionally reviewed source.

## Failure / denial / rework example

Partial GL batches, missing openings and unbalanced or mislabeled workbooks remain incomplete/rejected without overwriting accepted data. Unknown or deactivated dimension names, values outside the client's configured list, malformed service dates and out-of-period postings are rejected by the store before a new source revision or row is created.

## Implementation closure tasks

- [VP-036 — Close bounded GL control totals, replacement and downstream review](../chunks/05_Accounting/VP-036_Close_bounded_GL_control_totals_replacement_and_downstream_review.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-21) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
