# MOD-17 — Search & Centralized Client View

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `Shell search → exact record`  
**Component owner:** `Shell global-search dialog → target module view`  
**Persona sequence:** manager; repeat as client_admin and a narrow-grant user  
**Starting scenario:** `full-practice`  
**Source stories:** VP-008, VP-061

## What already exists

Deterministic local metadata search runs in an accessible dialog named `Global search`, with record-type and permitted-context filters, grant-scoped results and exact-record targets. An unauthorized record contributes no title, snippet, count or ordering, and historical requirements text is not indexed.

## Remaining work / demonstration limit

Complete all persona/record/unavailable target permutations and return navigation.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open **Search** from the shell and enter a known synthetic client/job/task/document code; the query field receives focus.
2. Filter by result type and permitted client/engagement context; confirm the option list itself only offers permitted contexts.
3. Open a result and verify both the record highlight and the active engagement.
4. Dismiss with Escape or the backdrop and check focus returns to the opener; open a result while a draft is dirty and the shared Save/Discard/Stay decision appears first.
5. Repeat as Amal Nasser and demonstrate CL-001/CL-003 but not CL-002.

## Expected client-visible outcome

Search selects the actual record rather than merely landing on a module home page; no semantic-search service is used.

## Failure / denial / rework example

Revoked, internal or unshared records must not leak via result text, counts or filter options.

## Implementation closure tasks

- [VP-008 — Complete Client 360 links and shared activity continuity](../chunks/01_Practice_CRM/VP-008_Complete_Client_360_links_and_shared_activity_continuity.md)
- [VP-061 — Finish scoped search targets and return-to-context cases](../chunks/08_Cross_Module_Closeout/VP-061_Finish_scoped_search_targets_and_return_to_context_cases.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-17) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
