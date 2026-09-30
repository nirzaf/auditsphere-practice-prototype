# MOD-19 — Identity & Access Management

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `administration`  
**Component owner:** `AdministrationView`  
**Persona sequence:** admin; test as the affected persona  
**Starting scenario:** `full-practice`  
**Source stories:** VP-018, VP-019

## What already exists

Local identities/invite lifecycle are reported verified; scoped grant/effective-window/revocation paths exist. Route, visibility and administrator checks resolve centrally, and the seeded `superuser` testing identity appears with the other practice personas.

## Remaining work / demonstration limit

Complete professional approval evidence, narrow-group and same-person expiry/revocation matrices.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Firm Administration and inspect a synthetic person separately from client contacts.
2. Nominate/create a local identity or show a simulated invitation state.
3. Grant an explicitly approved client/engagement scope with reason and effective window.
4. Switch to that persona and inspect permitted views.
5. Revoke/expire the grant in the supported conflict test and show stale dialog removal and current denial.

## Expected client-visible outcome

The browser illustrates intended authorization behavior; it is not a production authentication/security boundary.

## Failure / denial / rework example

A contact, role suggestion or system administrator label is not a professional approval or automatic scope grant. The reserved `superuser` persona is a testing shortcut, not a grant: the demo-identity role picker lists only the 14 product roles and the store rejects creating a second one, grants can only target a persona's own assigned role, and its actor-restricted actions are logged as labelled overrides rather than independent approvals.

## Implementation closure tasks

- [VP-019 — Close professional-role, expiry and group-scope demonstrations](../chunks/03_M365_Documents_Portal/VP-019_Close_professional_role_expiry_and_group_scope_demonstrations.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-19) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
