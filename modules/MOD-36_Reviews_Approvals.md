# MOD-36 — Reviews & Approvals

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_VERIFIED`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `approvals`  
**Component owner:** `ApprovalsEQRView`  
**Persona sequence:** manager → client management → partner → assigned independent EQR  
**Starting scenario:** `full-practice`  
**Source stories:** VP-056

## What already exists

Revision-bound management decisions, EQR assignment and current approval history are reported verified.

## Remaining work / demonstration limit

Preserve controls; provide a clear manual role-handoff explanation in the presentation.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Sign-offs & EQR and inspect the current validated package/review requirements; note that each revision and the TB/GL source lineage it is pinned to are shown.
2. Present the exact client-safe package to a granted management approver.
3. Record management rationale/evidence as that person, distinct from staff approval.
4. Assign an eligible independent EQR and demonstrate the separate concern/completion path when applicable.
5. Change a source/package revision — for example replace the GL source — and show the decision being refused with "The current financial package does not match the accepted GL source", then regenerate and re-review before recording the stage approval.

## Expected client-visible outcome

Approvals illustrate recorded human decisions only; no eSignature or professional certification is claimed.

## Failure / denial / rework example

Missing approvals, changed bytes, stale generation, a package pinned to a superseded TB/GL revision and duplicate same-generation issue must fail; management presentation, stage approval, candidate preparation and local issue all re-check the same lineage. A manager/partner already on the engagement team or the same preparer must not become the independent EQR by role switching. The reserved `superuser` testing identity can force such a decision for rehearsal, but the action is logged as a `Prototype Superuser Override` and is explicitly not an independent approval — demonstrate independence with two distinct ordinary personas.

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-36) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
