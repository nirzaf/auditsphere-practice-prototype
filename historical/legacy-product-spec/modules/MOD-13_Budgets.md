# MOD-13 — Budgets

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `budgets`  
**Component owner:** `BudgetsView`  
**Persona sequence:** manager; preparer for related time entry  
**Starting scenario:** `full-practice`  
**Source stories:** VP-029

## What already exists

Revisioned budgets and approved-time rate snapshots exist.

## Remaining work / demonstration limit

Close fixed arithmetic, missing-cost and engagement/job aggregation cases and final variance UX.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Budgets & Variances for the selected engagement/job.
2. Set the dedicated rehearsal fixture to 600 planned minutes and QAR 200/hour billing rate.
3. Provide 660 approved actual minutes and inspect +60 minutes and QAR 2,200 billable value.
4. Enter QAR 80/hour cost for the fixture and inspect QAR 880 actual cost; remove it and show Unavailable.
5. Revise the future budget rate and compare historical approved-time snapshots.

## Expected client-visible outcome

Planned billing value is QAR 2,000; actual value/cost are separate, and no scheduling automation is introduced.

## Failure / denial / rework example

An absent cost rate must not display zero cost or fabricated margin; job and engagement totals must not double count.

## Implementation closure tasks

- [VP-029 — Finish budget arithmetic and historical variance guidance](../chunks/04_Practice_Finance/VP-029_Finish_budget_arithmetic_and_historical_variance_guidance.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-13) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
