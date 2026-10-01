# MOD-31 — Populations & Sampling

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_VERIFIED`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `sampling`  
**Component owner:** `SamplingView`  
**Persona sequence:** preparer → independent selection reviewer  
**Starting scenario:** `audit-findings`  
**Source stories:** VP-051

## What already exists

Scoped population CSV/XLSX intake, manual selections/tests, finding links and independent evaluation are reported verified.

## Remaining work / demonstration limit

No new sampling engine required; demonstrate the existing local/manual scope and preserve regression.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Sampling & Populations and choose POP-01 or a scoped synthetic import.
2. Compare source period/currency and population-to-GL reconciliation.
3. Record manual selection rationale and selected stable item IDs.
4. Record tested, limited and untested outcomes and link an exception to a same-engagement finding.
5. Obtain independent evaluation, then replace the population to demonstrate retained prior tests and required fresh selection.

## Expected client-visible outcome

Counts and exceptions reconcile; the prototype does not infer statistical assurance or an audit conclusion.

## Failure / denial / rework example

Wrong period/currency, duplicate references or unresolved GL variance block selection/testing.

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-31) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
