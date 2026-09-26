# MOD-08 — Client Portal

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `portal`  
**Component owner:** `ClientPortalView`  
**Persona sequence:** client_admin → client_finance → client  
**Starting scenario:** `full-practice`  
**Source stories:** VP-025

## What already exists

Scoped multi-client portal, issued invoice PDF downloads and separate management acknowledgements exist; sharing withdrawal has been implemented.

## Remaining work / demonstration limit

Rehearse every list/action and withdrawal/no-access branch across the three client roles.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Choose Amal Nasser (client_admin) and open Client Experience Portal.
2. Switch between her explicit CL-001 and CL-003 scopes; compare requests, documents and invoices.
3. Choose Rami Nasser (client_finance) and demonstrate only his assigned contribution actions.
4. Choose Omar Nasser (client management) and inspect the exact presented package before a decision.
5. Download an issued demo invoice or a permitted generated artifact and explain its local/synthetic label.

## Expected client-visible outcome

Contributing a file, administering client contacts and approving management content are different permissions.

## Failure / denial / rework example

No Pay button, internal workpaper, draft invoice, cost rate or ungranted CL-002 record is exposed. Previewing a portal role from the reserved `superuser` identity keeps the same client disclosure filters and stays visibly labelled `SUPERUSER PORTAL PREVIEW · Previewing as …`; it does not switch or weaken the signed-in persona.

## Implementation closure tasks

- [VP-025 — Finish three-role portal and sharing-withdrawal demonstrations](../chunks/03_M365_Documents_Portal/VP-025_Finish_three_role_portal_and_sharing_withdrawal_demonstrations.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-08) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
