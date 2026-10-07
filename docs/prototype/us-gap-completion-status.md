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
expense-scope items, and the US-GAP-29 large-archive export remain open. The Worker
now streams checksum-backed R2 archive objects and no longer applies the 128 MiB
buffered-export cap to newly sealed archives. Legacy archives without an R2 SHA-256
checksum still use the bounded full-byte verification path; archive assembly and
the browser's Blob-based download still have memory limits, so large-archive
acceptance remains open. Each open story has concrete acceptance criteria in the
backlog and should be implemented through the active business UI/Worker with
current-account evidence.

## Externally blocked (integration layer implemented; external values still required)

The application now **declares and implements** each integration with a fail-closed,
honest state (see `docs/prototype/integration-configuration.md`):

- Email: standalone `worker/emailProvider` Worker implementing the `EMAIL_PROVIDER`
  contract over Cloudflare Email Service or a transactional email API; the business
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
| US-GAP-05 / 06 | Cloudflare Email Sending is enabled and DNS is configured for `mail.steaudit.com`. The restricted provider is deployed and the latest integration probe reported `SERVICE_BINDING`. The approved recipient `testing@mail.steauditing.com` remains Pending after verification was resent; a real delivery has not been accepted. |
| US-GAP-25 – 28 | Entra app `AuditSphere SharePoint UAT` is registered and `Sites.Selected` application consent is granted. The owner approved a single-site `write` grant for `/sites/AuditSphereJSAcceptance`, but it has not been applied; `SHAREPOINT_CLIENT_SECRET` is not configured. Do not report `CONNECTED` until the grant, secret and live probe succeed. |
| US-GAP-30 – 32 | Deployed URL/build identity are recorded. Existing UAT login accounts/persona mappings and connected SharePoint site/library evidence remain required. |

Production build `0689461738caf33ae13290809f063ccebf032374` is deployed. CI passed
typecheck, unit tests, build, browser E2E, the Email Service provider deployment,
D1 migrations, Worker deployment and readiness. The current integration evidence
for this build reports email `SERVICE_BINDING`; SharePoint is `UNCONFIGURED`
because its site grant and `SHAREPOINT_CLIENT_SECRET` are missing. The owner
approved the narrowly scoped `write` grant; an authorized grant-authority session
still needs to apply and verify it. Email delivery remains unverified until the
recipient is verified and an approved UAT send succeeds. Keep integration and UAT
stories BLOCKED rather than simulating acceptance.
