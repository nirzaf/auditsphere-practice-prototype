# MOD-03 — Leads & Opportunities

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_VERIFIED`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `acquisition`  
**Component owner:** `LeadsPipelineView`  
**Persona sequence:** relationship  
**Starting scenario:** `full-practice`  
**Source stories:** VP-009

## What already exists

Inquiry editing, stage/loss history, currency-separated pipeline, Won conversion and permitted client linking are repository-reported verified.

## Remaining work / demonstration limit

Preserve the implementation; only include it in integrated presentation rehearsal and regression.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Acquisition & Pipeline and select an inquiry.
2. Review service interest, expected fee/currency and stage history.
3. Qualify the inquiry; show how open pipeline totals change.
4. Record Won and convert to a Prospect, or link a permitted existing client.
5. Open the new client and point out that commercial conversion has not completed professional acceptance.

## Expected client-visible outcome

One Prospect per conversion operation; no duplicate engagement, authority grant or professional approval is created.

## Failure / denial / rework example

A non-Won conversion must fail; Lost/Unqualified requires a reason and is excluded from open totals. Leaving the pipeline with an unsaved inquiry draft is intercepted the same way: Stay keeps the draft, Discard creates no inquiry, and Save persists it before the client/engagement route change.

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-03) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
