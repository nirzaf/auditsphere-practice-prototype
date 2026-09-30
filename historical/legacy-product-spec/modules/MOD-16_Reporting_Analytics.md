# MOD-16 — Reporting & Analytics

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_VERIFIED`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `reports`  
**Component owner:** `ReportingCentreView`  
**Persona sequence:** manager/partner; then billing and records  
**Starting scenario:** `full-practice`  
**Source stories:** VP-060

## What already exists

All 16 report views, field-level CSV reconciliation, role catalogues and invoked print actions are repository-reported verified.

## Remaining work / demonstration limit

Retain tests and rehearse client-friendly interpretation; no new BI integration is pending.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Report Centre as manager and review the available report catalogue.
2. Choose a practice report and filter by client/date/currency where offered.
3. Open the linked source records and compare the displayed amounts/counts.
4. Export CSV and preview print; explain approved time, WIP and invoicing definitions.
5. Repeat as billing or records to show a smaller role-appropriate catalogue.

## Expected client-visible outcome

Reports explain persisted synthetic records; they are not AI analytics, statutory accounts or a live BI connection.

## Failure / denial / rework example

A filtered export must not contain another client; missing rate-derived values remain unavailable.

## Implementation closure tasks

No module-specific implementation task is created: the source reports this module Verified. Preserve it and run the integration/presentation checks; do not rebuild it.

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-16) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
