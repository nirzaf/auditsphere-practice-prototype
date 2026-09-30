# MOD-01 — Practice Dashboard

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `overview`  
**Component owner:** `DashboardView`  
**Persona sequence:** manager; repeat as partner, billing and a narrow-scope user  
**Starting scenario:** `full-practice`  
**Source stories:** VP-005, VP-060

## What already exists

Scoped portfolio metrics, as-of/overdue filters and count-to-list checks already exist.

## Remaining work / demonstration limit

Remaining persona combinations, empty/archived states and exact drill-down continuity need demonstration evidence.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Practice Overview as Layla Rahman. Set the demo as-of date to 2026-09-23.
2. Filter by client and engagement; point out the selected context and currency.
3. Open an overdue counter and compare its displayed total with the resulting list.
4. Return and change assignee/as-of filters; explain why counts change.
5. Switch to an eligible restricted persona and compare visibility, without treating a role switch as a real login.

## Expected client-visible outcome

Every visible counter equals its scoped detail; a zero-work engagement does not imply complete readiness.

## Failure / denial / rework example

A completed overdue item must not be counted as open; a no-access context must not reveal hidden names or counts.

## Implementation closure tasks

- [VP-005 — Close dashboard persona and count-to-record demonstrations](../chunks/01_Practice_CRM/VP-005_Close_dashboard_persona_and_count_to_record_demonstrations.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-01) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
