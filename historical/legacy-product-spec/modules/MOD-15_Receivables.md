# MOD-15 — Receivables

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `receivables`  
**Component owner:** `ReceivablesView`  
**Persona sequence:** billing  
**Starting scenario:** `full-practice`  
**Source stories:** VP-032, VP-033

## What already exists

Offline receipts, split allocations, reversal history, as-of aging and bucket drill-down exist.

## Remaining work / demonstration limit

Complete all boundary/stale/currency/input matrices and browser print-content verification.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Receivables & Receipts and set a client, currency and fixed as-of date.
2. Inspect an issued invoice and effective credits before entering an offline receipt.
3. Allocate part of a receipt across compatible invoices; inspect unallocated funds separately.
4. Reverse one allocation with a reason and inspect both invoice and receipt history.
5. Open an aging bucket, compare its invoice totals, export the statement and preview print.

## Expected client-visible outcome

The dedicated QAR 1,000 invoice less 100 credit and 300 receipt gives QAR 600 in 31–60 days at 2026-09-23.

## Failure / denial / rework example

Future receipts do not reduce a past balance; cross-client/currency and over-allocation must fail atomically.

## Implementation closure tasks

- [VP-032 — Verify offline receipt allocation and reversal matrices](../chunks/04_Practice_Finance/VP-032_Verify_offline_receipt_allocation_and_reversal_matrices.md)
- [VP-033 — Close as-of aging boundaries and client statement print content](../chunks/04_Practice_Finance/VP-033_Close_as_of_aging_boundaries_and_client_statement_print_content.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-15) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
