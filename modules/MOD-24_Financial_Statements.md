# MOD-24 — Financial Statements

[All modules](../01_MODULE_INDEX.md) · [Presenter playbook](../02_CLIENT_DEMO_PLAYBOOK.md) · [Role handoffs](../reference/ROLE_HANDOFF_GUIDE.md)

**Repository-reported baseline:** `REPOSITORY_REPORTED_PARTIAL`  
**Client-demo rehearsal:** `NOT_RUN` by this review  
**Route / workspace:** `financial-statements`  
**Component owner:** `FinancialStatementsView`  
**Persona sequence:** preparer → independent financial reviewer  
**Starting scenario:** `accounting-only`  
**Source stories:** VP-040, VP-041

## What already exists

Mapped balance sheet/income statement, comparative history, reviewed cash-flow/equity schedules and shared notes exist.

## Remaining work / demonstration limit

Close bounded layout/grouping/subtotals, component-equity support where evidenced and full comparative/disclosure rework.

## How to demonstrate this module

These are source-derived rehearsal instructions. Exact final labels and pending controls must be checked against the current build; they are not a record of browser actions executed during this review. Where a required control remains pending, show its limitation or defer that step—do not simulate a successful business outcome.

1. Open Financial Statements with current approved mappings.
2. Switch between statement types and trace a line to its source accounts.
3. Select a compatible prior engagement; show Unavailable rather than fabricated zero when prior data is absent.
4. Prepare/review evidence-backed cash-flow and equity movements, and select current note applicability.
5. Save/review the exact statement revision, change an input — the TB source or a journal's pinned support record — and inspect the exclusion notice and stale state before regeneration.

## Expected client-visible outcome

Statements reconcile to accepted sources and adjustments; synthetic methods/rates do not imply professional certification.

## Failure / denial / rework example

Unmapped comparatives, unsupported component equity and unreviewed notes/schedules must not appear as valid supported output. A management-accepted adjustment is dropped from the presented figures with a stated reason when its reflection is partial/unknown, its source revision or account codes no longer match the current trial balance, or its pinned evidence, workpaper or finding needs review.

## Implementation closure tasks

- [VP-040 — Complete bounded statement layout and comparative regeneration](../chunks/05_Accounting/VP-040_Complete_bounded_statement_layout_and_comparative_regeneration.md)
- [VP-041 — Close cash-flow, equity and per-note disclosure rework](../chunks/05_Accounting/VP-041_Close_cash_flow_equity_and_per_note_disclosure_rework.md)

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

[Original module/stories](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#mod-24) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)
