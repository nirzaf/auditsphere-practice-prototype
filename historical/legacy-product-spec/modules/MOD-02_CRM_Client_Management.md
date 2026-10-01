# MOD-02 — CRM & Client Management

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `clients → client-detail`  
**Component owner:** `ClientsView / ClientDetailView`  
**Persona sequence:** relationship; manager for linked professional records  
**Starting scenario:** `full-practice`  
**Source stories:** VP-006, VP-007, VP-008

## What already exists

Client/contact creation, primary contact, custom values and non-authorizing relationship groups exist; contact responsibility/effective dates now have recorded implementation.

## Remaining work / demonstration limit

Complete lifecycle and stale-edit coverage, required-field reconciliation and all Client 360 actions remain open.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Client Portfolio and select Example Trading Entity (CL-001).
2. Review Profile and Contacts; identify the primary contact, relationship owner and client code.
3. Create a distinct synthetic client/contact or edit a permitted field with a clear reason.
4. Inspect a typed custom value and a relationship-group link; explain that neither grants access.
5. Open a related engagement/invoice/document from Client 360 and return to the same client context.

## Expected client-visible outcome

One shared client/contact identity appears across related screens; historical references survive inactivation/archive.

## Failure / denial / rework example

Try a duplicate normalized client code or invalid effective-date range; preserve the previous record after rejection. Closing the profile editor or navigating away with an unsaved draft asks to Save, Discard or Stay; Discard stores nothing and returns focus to the opener.

## Implementation closure tasks

- [VP-006 — Finish client-profile lifecycle and stale-edit behavior](../chunks/01_Practice_CRM/VP-006_Finish_client_profile_lifecycle_and_stale_edit_behavior.md)
- [VP-007 — Verify contact responsibilities, custom fields and relationship boundaries](../chunks/01_Practice_CRM/VP-007_Verify_contact_responsibilities_custom_fields_and_relationship_boundaries.md)
- [VP-008 — Complete Client 360 links and shared activity continuity](../chunks/01_Practice_CRM/VP-008_Complete_Client_360_links_and_shared_activity_continuity.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-02) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
