# MOD-14 — Billing & Invoicing

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `billing`  
**Component owner:** `BillingInvoicingView`  
**Persona sequence:** billing → independent billing reviewer  
**Starting scenario:** `full-practice`  
**Source stories:** VP-030, VP-031

## What already exists

Approved-time/fixed-fee invoice sources, reservations, review/issue and partial credits exist. Drafts pre-fill the invoice/credit number from the saved firm-settings prefix and next number (the counter advances exactly once when that number is consumed; duplicates are rejected) and the due date from the saved payment terms. Source-linked drafts can be revised through Edit/Revise with the pinned time/fixed-fee lines carried byte-identically, and reviewer returns record a mandatory note that clears on rework or approval.

## Remaining work / demonstration limit

Complete ad-hoc/draft/cancel/return, credit cap and download/correction matrices; reconcile whether per-service allocation is truly required.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Billing & Invoices and select a client with approved billable time or an accepted proposal.
2. Draft lines from permitted sources; compare currency, rate revision and remaining contract balance.
3. Submit and obtain review from a different eligible person, then issue locally.
4. Create and independently review a partial credit against the issued invoice.
5. Open the client-safe invoice/download and receivables; explain local issue versus simulated mail versus settlement.

## Expected client-visible outcome

Firm billing never changes the client TB or group books; no payment gateway or real payment request is used.

## Failure / denial / rework example

Duplicate time consumption, self-review, over-contract invoicing and excess credit must be blocked.

## Implementation closure tasks

- [VP-030 — Close invoice-source, ad-hoc line and reservation behavior](../chunks/04_Practice_Finance/VP-030_Close_invoice_source_ad_hoc_line_and_reservation_behavior.md)
- [VP-031 — Finish invoice review, credit and genuine-download journeys](../chunks/04_Practice_Finance/VP-031_Finish_invoice_review_credit_and_genuine_download_journeys.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-14) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
