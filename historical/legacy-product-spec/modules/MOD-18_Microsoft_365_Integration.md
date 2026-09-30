# MOD-18 — Microsoft 365 Integration

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `m365-setup`  
**Component owner:** `M365SetupView`  
**Persona sequence:** admin  
**Starting scenario:** `full-practice`  
**Source stories:** VP-017, VP-020, VP-021, VP-022, VP-026

## What already exists

Local setup, fixture people/role mapping, independent SharePoint/mail/optional OneDrive simulations and failures exist.

## Remaining work / demonstration limit

Complete start/back/cancel/summary, reconnect and stale-test matrices; improve clear local simulation instructions.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Microsoft 365 Setup as system administrator and read the simulation banner.
2. Enter/select only fixture tenant/site/library/root/sender values; review initial identity mappings.
3. Run a simulated SharePoint check and a separate simulated mail check.
4. Leave OneDrive disabled or explicitly enable it and demonstrate a bounded local metadata import.
5. Disconnect or select a denied-site fixture, then show recovery and continued unrelated local jobs.

## Expected client-visible outcome

Every success says Simulated; liveConnected remains false and scoped access grants are still separate.

## Failure / denial / rework example

No credentials, OAuth redirect or provider call is allowed; a failed optional mail test does not invalidate SharePoint.

## Implementation closure tasks

- [VP-017 — Complete the Microsoft setup wizard demonstration](../chunks/03_M365_Documents_Portal/VP-017_Complete_the_Microsoft_setup_wizard_demonstration.md)
- [VP-020 — Verify logical workspace preparation and shared document links](../chunks/03_M365_Documents_Portal/VP-020_Verify_logical_workspace_preparation_and_shared_document_links.md)
- [VP-021 — Close document revision, availability and storage-class guidance](../chunks/03_M365_Documents_Portal/VP-021_Close_document_revision_availability_and_storage_class_guidance.md)
- [VP-022 — Finish simulated provider failure and reconnect paths](../chunks/03_M365_Documents_Portal/VP-022_Finish_simulated_provider_failure_and_reconnect_paths.md)
- [VP-026 — Verify simulated mail templates, retry intent and duplicate clicks](../chunks/03_M365_Documents_Portal/VP-026_Verify_simulated_mail_templates_retry_intent_and_duplicate_clicks.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-18) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
