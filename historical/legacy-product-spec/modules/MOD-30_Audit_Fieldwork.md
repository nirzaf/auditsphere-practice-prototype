# MOD-30 — Audit Fieldwork

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `audit-risks / audit-fieldwork`  
**Component owner:** `AuditRisksProgramsView`  
**Persona sequence:** preparer → assigned independent reviewer  
**Starting scenario:** `audit-findings`  
**Source stories:** VP-050

## What already exists

Procedure execution, current evidence/limitation checks and independent clearance exist. Returning submitted or cleared fieldwork now requires a bounded reason (recorded with actor and time, shown as “Returned: …” until re-clearance), and the rendered scope-reassessment history surfaces planning/evidence invalidations.

## Remaining work / demonstration limit

Complete the remaining fieldwork acceptance matrix and link to the existing VP-049 template owner; the reasoned-return control itself is implemented (a return without a reason is rejected atomically).

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open an engagement procedure (for example PRC-01) in Risks & Audit Programs.
2. Read objective/instructions, linked risks and current evidence.
3. Record work performed, results, exceptions or an explicit limitation.
4. Submit the exact current revision and switch to its eligible independent reviewer.
5. Return with the required bounded reason, rework and clear; compare an unresolved exception such as PRC-04 without hiding it.

## Expected client-visible outcome

Submitting is not clearance; every applicable procedure retains its own work/result/reviewer state.

## Failure / denial / rework example

Preparer self-clearance, stale/inadequate evidence or reassessment-required procedures must not pass.

## Implementation closure tasks

- [VP-050 — Complete fieldwork exception return and evidence rework](../chunks/07_Audit_Fieldwork/VP-050_Complete_fieldwork_exception_return_and_evidence_rework.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-30) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
