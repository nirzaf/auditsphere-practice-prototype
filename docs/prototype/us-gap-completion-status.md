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

US-GAP-02, 03, 04, 05, 06, 10, 14, 15, 17, 18, 19, 20, and the remaining
US-GAP-24 expense-scope items remain open. US-GAP-29 large-archive export is now
partially implemented: archive creation reads and SHA-256-verifies one committed
R2 object at a time, streams ZIP chunks to R2, verifies the stored object by
streaming it back, and records the resulting digest/size before the seal transaction.
Exports without an R2 SHA-256 checksum verify the digest while streaming to the
client; checksum-backed exports retain R2's verified body stream. The previous
64 MiB assembly and 128 MiB export-buffer limits have been removed. The current
ZIP32 format still imposes a 4 GiB archive/member limit, and browser fallback
behavior without the File System Access API remains a hash-verified Blob. Large-
archive acceptance remains open until tests cover the full supported size range
and all supported download paths end-to-end. Each open story has concrete
acceptance criteria in the backlog and should be implemented through the active
business UI/Worker with current-account evidence.

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
| US-GAP-30 – 32 | Deployed URL/build identity are recorded. UAT follows the epic's no-auth profile with four self-selected personas and synthetic records; supplied login accounts are not required. Real email delivery and a connected SharePoint test-site probe remain unverified. |

Application code build `bcd23de750459b99277d937df2205573cd505d99` is deployed.
GitHub Actions run 37656134133 passed typecheck, unit tests, build, the complete
browser E2E suite, Email Service provider deployment, D1 migrations, Worker/static
asset deployment and readiness. The live integration probe at 2026-10-07 17:09 UTC
reports email `SERVICE_BINDING`; SharePoint remains `UNCONFIGURED` because
`SHAREPOINT_CLIENT_SECRET` is missing. The owner approved the narrowly scoped
`write` grant; the inspected SharePoint admin session did not apply it. Email
delivery remains unverified until the recipient is verified and an approved UAT
send succeeds. Keep integration stories BLOCKED rather than simulating acceptance.
