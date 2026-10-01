# MOD-05 — Jobs & Tasks

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `jobs`  
**Component owner:** `JobsTasksView`  
**Persona sequence:** manager → preparer / preparer-2  
**Starting scenario:** `full-practice`  
**Source stories:** VP-013, VP-014

## What already exists

Jobs, one-level subtasks, reassignment, editing/reordering and task comments/document links are present; VP-014 is recorded verified despite a stale Requirements UI row.

## Remaining work / demonstration limit

Close job completion/nonterminal rework combinations; retain terminal cancellation and reconcile status text.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Jobs & Tasks for the selected engagement; apply owner/status/overdue filters.
2. Open a job and show linked files, time and its task hierarchy.
3. Edit a task, reassign to Nadia Rahman with a reason and inspect history.
4. Add an internal task note or link an already registered scoped document.
5. Complete child work manually, then complete the parent/job only when required children are complete.

## Expected client-visible outcome

Assignment, ordering, notes and status persist; assignment never grants professional approval authority.

## Failure / denial / rework example

An open child must block parent completion; a second nesting level and a cancelled-job reopen must be denied.

## Implementation closure tasks

- [VP-013 — Finish job completion, editing and nonterminal rework](../chunks/02_Work_Collaboration/VP-013_Finish_job_completion_editing_and_nonterminal_rework.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-05) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
