# MOD-39 — Administration

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `administration`  
**Component owner:** `AdministrationView`  
**Persona sequence:** admin; professional functions remain with their granted actors  
**Starting scenario:** `full-practice`  
**Source stories:** VP-019, VP-062

## What already exists

Firm settings and local identity/grant screens exist, and settings are consumed prospectively: billing drafts pre-fill the saved invoice/credit prefix and next number (the counter advances once on consumption; duplicates are rejected) and due dates from the saved payment terms, while timezone and optional logo-reference settings show an explicit no-logo placeholder state. The Role-Based Access Control tab catalogues ten core business-authority roles; the commercial, records and reserved `superuser` identities are documented in the role reference rather than this catalogue.

## Remaining work / demonstration limit

Rehearse numbering-collision rejection and the logo-unavailable placeholder state, and reconcile dedicated editor ownership; prospective consumption itself is implemented and verified.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Firm Administration and review permitted firm/numbering/service defaults.
2. Change one supported setting with a reason and inspect its revision.
3. Create a new draft/preview to demonstrate that the new default applies prospectively.
4. Open an already-issued invoice or released package and show that it is unchanged.
5. Inspect user/grant settings separately; explain that system administration does not confer professional review powers, and that the `superuser` testing identity appears in the persona list only as a reserved fixture.

## Expected client-visible outcome

Settings have one owner and visible future effect, with no AI, tax/payroll, payment, Purview or automation controls.

## Failure / denial / rework example

Invalid numbering/defaults and excluded-feature toggles must not be accepted; settings cannot rewrite historic artifacts.

## Implementation closure tasks

- [VP-019 — Close professional-role, expiry and group-scope demonstrations](../chunks/03_M365_Documents_Portal/VP-019_Close_professional_role_expiry_and_group_scope_demonstrations.md)
- [VP-062 — Verify prospective firm settings and editor ownership](../chunks/08_Cross_Module_Closeout/VP-062_Verify_prospective_firm_settings_and_editor_ownership.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-39) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
