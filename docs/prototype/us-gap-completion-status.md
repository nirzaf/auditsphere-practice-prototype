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

## Externally blocked (integration layer implemented; external values still required)

The application now **declares and implements** each integration with a fail-closed,
honest state (see `docs/prototype/integration-configuration.md`):

- Email: standalone `worker/emailProvider` Worker implementing the `EMAIL_PROVIDER`
  contract over Cloudflare Email Routing or a transactional email API; the business
  Worker's outbox already dispatches through `EMAIL_PROVIDER` and reports
  `EMAIL_PROVIDER_NOT_CONFIGURED` when absent.
- SharePoint/Graph: `worker/integrations/sharepoint.ts` resolves the site to stable
  site/drive/root identifiers, creates folders, uploads bytes, lists versions and
  reads retention, with bounded throttling retries.
- A live probe is exposed at `GET /api/integrations/status` reporting
  configured/connected/failed (never a synthetic success).

Supplying the following firm-owned values is what remains; none can be created from
the repository:

| Story | Blocking prerequisite |
| --- | --- |
| US-GAP-05 / 06 | A verified sender domain/address plus either Email Routing enabled or an email-API key, and approved non-production test recipients (bind `EMAIL_PROVIDER` and deploy `worker/emailProvider`). |
| US-GAP-25 – 28 | The designated existing SharePoint site/library and an approved Microsoft Entra app registration (tenant id, client id, client secret, `Sites.Selected` grant). Set the `SHAREPOINT_*` values and `/api/integrations/status` flips to `CONNECTED`. |
| US-GAP-30 – 32 | The supplied existing login accounts, deployed build identity and the live SharePoint site for the UAT ledger. |

Until those values exist, `sharepoint.state` is `UNCONFIGURED`/`FAILED` and email is
`UNCONFIGURED`; the backlog requires that these remain BLOCKED rather than simulated.
