# US-GAP completion status (AuditSphere specification-completion backlog)

This index maps the US-GAP stories from the "Specification Completion User Stories"
backlog to the current implementation and execution evidence. It is a truthful
pointer, not a claim of professional or production acceptance. "Locally verified"
means a passing unit/build check on this branch; it does not replace the live-account
and live-SharePoint UAT the backlog requires.

## Verified in this change set

| Story | Scope delivered | Evidence |
| --- | --- | --- |
| US-GAP-29 (R01) | Directory services now forward an explicit page cursor/limit so clients, leads and other bounded lists are retrievable beyond the first 100 through the workspace UI (`Load more` on the client registry and lead pipeline). | `tests/unit/businessDirectoryPagination.test.ts`; backend cursor contract already covered by `tests/unit/businessWorkspace.test.ts`. |
| US-GAP-24 (R50) | Firm expense capture derives the debit account from the operating category (rent 5000 / salaries 5100 / overheads 5200 / petty cash 5300 / other→overheads) and records an explicit accounting date instead of hardcoded `5200` + today. | `tests/unit/practiceAccounts.test.ts`; UI change in `BusinessPracticePanel.tsx`. |
| US-GAP-09 (R22–R24) | The materiality form now exposes the permitted performance-materiality (TE 50–75% of PM) and clearly-trivial (SAD 3–5% of PM) inputs, validated client-side and by the existing Worker bounds, instead of always submitting 60% / 4%. | UI + validation in `BusinessTrialBalancePanel.tsx`; PBT exclusion already covered by `materialityBenchmark.test.ts`. |
| US-GAP-07 (R19, partial) | Planning now shows a multi-date capacity calendar over a selectable range (available/assigned minutes, approved leave, overbooking/exception status per staff per day), alongside the existing capacity/leave/assignment controls. | Build + typecheck; additive UI in `BusinessPlanningPanel.tsx`. |
| Documentation contract | Regenerated `docs/prototype/lifecycle-matrix.md`, which previously failed `tests/unit/docsContract.test.ts`. | `tests/unit/docsContract.test.ts` now passes. |

## Implementation present in the repository (acceptance verification still required)

The following stories have substantive, source-grounded implementation and regression
tests merged on this branch; they still need the backlog's current-account and
real-output acceptance for closure.

| Story | Reference |
| --- | --- |
| US-GAP-01 | Client contact/signatory/recipient-route maintenance (`feat(directory) …`). |
| US-GAP-08 | Prior-year-only mapping and comparative preservation. |
| US-GAP-11 | In-place analytical-review rework variety. |
| US-GAP-12 / 13 | Fieldwork completeness gates (`fieldworkGates.test.ts`). |
| US-GAP-16 | Five-part bundle SQL alias and representation-return identity (`reportingBundleSql.test.ts`, `reportingReleaseIdentity.test.ts`). |
| US-GAP-21 / 22 / 23 | Time FSLI linkage, future-effective rate date, multi-phase budget and rendered profitability/utilization. |

## Not completed in this change set (source-grounded work remaining)

US-GAP-02, 03, 04, 05, 06, 10, 14, 15, 17, 18, 19, 20, the remaining US-GAP-24
expense-scope items, and the US-GAP-29 large-archive export remain open. Each has
concrete acceptance criteria in the backlog and should be implemented through the
active business UI/Worker with current-account evidence.

## Externally blocked (cannot pass by substitution)

| Story | Blocking prerequisite |
| --- | --- |
| US-GAP-05 / 06 | A configured non-production email provider and approved test recipients (no `EMAIL_PROVIDER` service binding is declared in `wrangler.jsonc`). |
| US-GAP-25 – 28 | The designated existing SharePoint site/library and approved Microsoft Graph integration access. No Graph/SharePoint binding exists in `worker/env.ts` or `wrangler.jsonc`; the historical `m365Config` is explicitly synthetic. |
| US-GAP-30 – 32 | The supplied existing login accounts, deployed build identity and live SharePoint site for the UAT ledger. |

These remain BLOCKED with the exact prerequisite recorded rather than simulated.
