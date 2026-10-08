# US-GAP completion status (AuditSphere specification-completion backlog)

This index maps the US-GAP stories from the "Specification Completion User Stories"
backlog to the current implementation and execution evidence. It is a truthful
pointer, not a claim of professional or production acceptance. "Locally verified"
means a passing unit/build check on this branch; it does not replace the live-account
and live-SharePoint UAT the backlog requires.

## Verified in this change set

| Story | Scope delivered | Evidence |
| --- | --- | --- |
| US-SYS-002 (partial) | The deployment-only cutover now migrates canonical leads with exact client/contact ID links, source enums, valid UTC receipt time, calendar period, minor-unit fee, preserved status and loss rationale. A forward-only schema-41 migration extends both target and APPLIED-run guards to require normalized lead rows. No transitions or approvals are invented. | `tests/unit/businessMigrationApply.test.ts` proves atomic lead insertion, target relationships, ID mapping, and zero synthesized `state_transitions`; invalid/missing loss reasons block apply. Invoice and engagement transformation, a real workspace cutover and external acceptance remain open. |
| US-GAP-04 (partial) | Engagement-letter issue now requires the primary EL route, primary CFO/Finance Director invoice route, explicit due date and current approved tax policy. It atomically issues the exact accepted EL and creates its 50% advance invoice in `PENDING_DOCUMENT`, with a pinned invoice-generation job; invoice delivery is queued only after verified PDF storage. The final accepted proposal milestone is printed as the EL submission deadline. | Worker route, tax-policy, acceptance and risk pins are rechecked by the command transaction; missing billing prerequisites block both records. The Worker integration test now decompresses the rendered EL and asserts its client, service, period, fee, final milestone, approved clauses, signature/seal labels and disclaimer; it also checks the immutable issued record references the exact proposal, acceptance, clearance, template, PDF, signature and seal IDs plus content hash. Real delivery and external visual review remain open. |
| US-FLD-001 (partial) | A fault-injected TB import now proves recovery after four of eight 40-row staging chunks commit. Retrying the same import reaches `READY` with exactly 320 unique staged rows, while the prior active TB remains unchanged until explicit activation. | `tests/unit/businessWorkspace.test.ts` drives the Worker outbox against the SQLite D1 adapter and verifies the partial `VALIDATING` state, active-version pin and recovered row count. Production D1 interruption and the story's remaining full XLSX/parser matrices remain open; see `verification.md`. |
| US-FLD-002 (partial) | After a reviewer approves a mapping version, proposing mappings again for the same client, TB and framework returns all ten exact-history suggestions with their source mapping IDs and `confirmed=false`; approval still requires explicit row confirmation. Database insert validation now also requires history source provenance to match the same client/entity, framework, account and FSLI. | `tests/unit/businessWorkspace.test.ts` verifies normal exact-history reuse and rejects subsidiary rows sourced from a parent mapping and rows relabeled to another framework. An independent valid subsidiary/framework mapping journey and remaining mapping acceptance remain open; see `verification.md`. |
| US-FLD-003 (partial) | Live statements now assert the source-pinned QAR 23,000 assets, QAR 10,000 liabilities and QAR 3,000 profit for the accepted 10-row TB; source-row drill-down, explicit new-balance status and repeated single-application of an approved AJE are covered. Comparative variance edge cases use an exported pure calculation with all five acceptance examples. | `tests/unit/businessWorkspace.test.ts` and `tests/unit/statementVariance.test.ts`. Visual split-pane/action parity and a no-comparative TB browser journey remain open; see `verification.md`. |
| US-FLD-004 (partial) | Analytical-review submission now reports missing explanation, conclusion and adequate current support together as `VALIDATION_FAILED` fields. Going-concern tests reject unsupported checklist claims and a short horizon, preserve `UNASSESSED`, block its review submission, and pin the approved engagement profile's ISA 570 edition. Unit coverage checks the 15 December 2026 effective-date boundary. | `tests/unit/businessWorkspace.test.ts` and `tests/unit/goingConcernStandards.test.ts`; visual no-forecast state and all reporting implications remain open; see `verification.md`. |
| US-GAP-03 (partial) | Proposal authors can add/remove up to 24 individually labeled milestones; full proposals explicitly select the current approved CVs for the proposed team, and the assigned Partner CV is mandatory. Only the selected, latest approved CV per active staff member is pinned into the immutable proposal revision; quotes carry no CVs. Partner-maintained credentials and relevant industry portfolio text plus separate committed PDF/DOCX evidence files are required for full proposals. Exact evidence versions are pinned, referenced by filename/digest in the PDF and attached to the approved dispatch. | `worker/business.ts`, `worker/businessOutbox.ts` and migrations 0036–0037 validate, snapshot and retain selected content and files; `worker/proposalDocument.ts` blocks incomplete content, renders evidence references, and starts full-proposal qualifications/team on a separate page. `BusinessWorkspace.tsx` exposes Partner-managed inputs/selections. The focused PDF test decompresses actual quote and comprehensive-proposal streams and checks terms, fee split, firm content, selected file names and page numbering. Live dispatch and independent visual layout acceptance remain open. |
| US-GAP-29 (R01) | Directory services now forward an explicit page cursor/limit so clients, leads and other bounded lists are retrievable beyond the first 100 through the workspace UI (`Load more` on the client registry and lead pipeline). | `tests/unit/businessDirectoryPagination.test.ts`; backend cursor contract already covered by `tests/unit/businessWorkspace.test.ts`. |
| US-GAP-24 (R50) | Firm expense capture derives the debit account from the operating category (rent 5000 / salaries 5100 / overheads 5200 / petty cash 5300 / other→overheads), revalidates that category mapping at approval, and records an explicit accounting date. A dedicated petty-cash replenishment command requires distinct active Bank and Cash asset controls and posts a dated, idempotent debit to Petty Cash / credit to Bank without debiting an expense account; the UI labels it as an asset transfer. | `tests/unit/practiceAccounts.test.ts`; `tests/unit/businessWorkspace.test.ts` PRC-005 scenario covers a QAR 300 petty-cash voucher with committed synthetic support, a persisted missing-support exception, self-review denial, exact count and variance reconciliation, append-only protection, account-mapping rejection, bank-to-cash journal lines and balance, idempotent retry, and no second 5300 expense debit. It also checks that Partner withdrawal debits Drawings equity, credits Bank and leaves the posted P&L expense balance unchanged. UI in `BusinessPracticePanel.tsx`. Current-source/live-document acceptance and the full epic remain open. |
| US-GAP-09 (R22–R24) | The materiality form now exposes the permitted performance-materiality (TE 50–75% of PM) and clearly-trivial (SAD 3–5% of PM) inputs, validated client-side and by the existing Worker bounds, instead of always submitting 60% / 4%. | UI + validation in `BusinessTrialBalancePanel.tsx`; PBT exclusion already covered by `materialityBenchmark.test.ts`. |
| US-GAP-07 (R19, partial) | Planning now shows a multi-date capacity calendar over a selectable range (available/assigned minutes, approved leave, overbooking/exception status per staff per day), alongside the existing capacity/leave/assignment controls. | Build + typecheck; additive UI in `BusinessPlanningPanel.tsx`. |
| Documentation contract | Regenerated `docs/prototype/lifecycle-matrix.md`, which previously failed `tests/unit/docsContract.test.ts`. | `tests/unit/docsContract.test.ts` now passes. |

## Implementation present in the repository (acceptance verification still required)

The following stories have substantive, source-grounded implementation and regression
tests merged on this branch; they still need the backlog's current-account and
real-output acceptance for closure.

| Story | Reference |
| --- | --- |
| US-GAP-02 | Client acceptance now synchronizes the exact active proposal fee to the engagement in the same atomic command; the prior estimate, immutable proposal revisions, acceptance record and signed terms remain separate. Regressions cover a revised fee of 250,001 minor units, the 50/50 odd-unit split, stale acceptance, revocation and idempotent commands (`businessWorkspace.test.ts`, `calculations.test.ts`). |
| US-GAP-01 | Client contact/signatory/recipient-route maintenance (`feat(directory) …`). |
| US-GAP-08 | Prior-year-only mapping and comparative preservation. |
| US-GAP-11 | In-place analytical-review rework variety. |
| US-GAP-12 / 13 | Fieldwork completeness gates (`fieldworkGates.test.ts`). |
| US-GAP-16 | Five-part bundle SQL alias and representation-return identity (`reportingBundleSql.test.ts`, `reportingReleaseIdentity.test.ts`). |
| US-GAP-21 / 22 / 23 | Time FSLI linkage, future-effective rate date, multi-phase budget and rendered profitability/utilization. |

## Not completed in this change set (source-grounded work remaining)

US-GAP-03, 04, 05, 06, 10, 14, 15, 17, 18, 19, 20, and the remaining
US-GAP-24 expense-scope items remain open. US-GAP-29 large-archive export is now
partially implemented: archive creation reads and SHA-256-verifies one committed
R2 object at a time, streams ZIP chunks to R2, verifies the stored object by
streaming it back, and records the resulting digest/size before the seal transaction.
Exports without an R2 SHA-256 checksum verify the digest while streaming to the
client; checksum-backed exports retain R2's verified body stream. The previous
64 MiB assembly and 128 MiB export-buffer limits have been removed. The archive
writer now emits streaming ZIP64 local headers, descriptors, central-directory
entries and end records, removing the ZIP32 4 GiB archive/member cap; it still
rejects byte counts beyond JavaScript's exact safe-integer range. The browser
fallback now hashes and counts response chunks in a TransformStream before
materializing its Blob, avoiding an extra whole-archive ArrayBuffer copy; it also
rejects unsafe, truncated, oversized and digest-mismatched responses. The Worker
rejects unsafe D1 byte counts before either checksum-backed or digest-streamed
exports and validates the sealed hash before reading archive bytes. Large-archive acceptance remains open until tests cover actual multi-gigabyte members,
the full supported size range and all supported download paths end-to-end. Sealed objects now use dedicated
retention-specific prefixes, and `worker/r2-archive-locks.json` contains generated
prefix rules for every supported term. CI and `npm run cloud:deploy` now apply
these rules idempotently and verify their Cloudflare read-back before Worker
deployment; a Cloudflare API token with R2 bucket configuration edit permission
is required. Successful GitHub Actions run 37711971223 applied and read back all
101 managed rules on `auditsphere-prototype-files`, preserving zero unrelated
rules. The bucket policy is configured and API-read-back verified. A live attempt
to overwrite/delete a retained canary object is not claimed; full storage-path
enforcement and multi-gigabyte acceptance remain open.
Each open story has concrete
acceptance criteria in the backlog and should be implemented through the active
business UI/Worker with current-account evidence.

US-FLD-005/006 have additional partial implementation evidence: the fieldwork
workspace test verifies that a conditional ad-hoc procedure can be marked not
applicable with a reason, submitted, and independently approved by a reviewer.
This exposed and fixed a stale-review dependency mismatch: the not-applicable
submission now snapshots the same sampling pins as other procedure submissions.
The test also approves a second template revision and confirms the active
workprogram remains pinned to the original template and copied standard steps.
The fieldwork UI now displays the preparer's N/A rationale alongside the
reviewer controls, and the `Approve N/A` action correctly recognizes the
Worker's boolean `applicable=false` projection. The two-person browser regression
passed in the hosted full E2E suite on run 37711971223; local execution still fails
before page load because Chrome does not expose CDP and Edge exits during startup.
Required-step validation
across direct `procedure.submit` and generic `review.submit` now returns exact
missing `workPerformed` and `conclusion` field names and creates no submission
record. Inserting an ad-hoc procedure also versions each shifted editable row,
stores the rationale in a new immutable procedure revision and emits a change
feed entry; insertion is rejected when it would shift a submitted or reviewed
row. Procedure update/evidence matrices and the remaining workprogram gates stay
open.

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
| US-GAP-25 – 28 | Entra app `AuditSphere SharePoint UAT` has `Sites.Selected` consent and a verified site-only `write` grant on `/sites/AuditSphereJSAcceptance` (2026-10-08). The latest live probe at 2026-10-08 04:26:07 UTC returned `FAILED` because the Microsoft Graph token request was rejected. The configured client secret must be owner-rotated before the probe can reach `CONNECTED`. |
| US-GAP-30 – 32 | Deployed URL/build identity are recorded. UAT follows the epic's no-auth profile with four self-selected personas and synthetic records; supplied login accounts are not required. Real email delivery and a connected SharePoint test-site probe remain unverified. |

The last fully successful production deployment is main commit `d8197c1` from
[GitHub Actions run 37727121265](https://github.com/nirzaf/auditsphere-practice-prototype/actions/runs/37727121265)
(2026-10-08). It passed typecheck, unit tests, full hosted browser E2E,
production build, schema-41 D1 migration, Worker/static asset deployment and
readiness. Previous successful run 37711971223 applied and read back all 101
R2 archive rules and deployed the restricted Email Service provider. Earlier main runs
37710179893, 37710812829 and 37711380454 passed verification but failed the strict
Worker config check; run 37711971223 verified the source-config deploy fix. The latest
live `/api/integrations/status` request on 2026-10-08 04:26:07 UTC reported email
`SERVICE_BINDING` and SharePoint `FAILED` because the Graph token request is
rejected. The site-only `write` grant remains independently verified. Email
delivery remains unverified: `testing@mail.steauditing.com` was last observed as
Pending and an approved UAT send has not succeeded. Keep integration stories open
until current delivery and connected SharePoint evidence exists.
