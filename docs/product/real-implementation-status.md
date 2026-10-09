# AuditSphere real-implementation epic status

**Scope source:** user-provided `EPIC-AUDITSPHERE-REAL-IMPLEMENTATION.md` (specification version 1.0, 2026-10-05). Its no-application-auth operating profile overrides historical E03 login requirements in this repository. The epic is a requirements source, not evidence that acceptance has passed.

**Status rule:** `Code baseline; acceptance open` means related domain code exists in this repository, but this tracker does not claim the story is Done until its story acceptance criteria have current test or operational evidence. A passing build or broad unit suite alone does not close the epic's cross-browser, file-hash, restore, external integration, trusted-boundary, or business-approval gates.

## Story traceability

| Story | Title | Current status |
|---|---|---|
| US-SYS-001 | Persistent Four-Persona Workspace Context | Code baseline; acceptance open |
| US-SYS-002 | Normalize Persistence and Remove Demo-Only Authority | Code baseline; acceptance open |
| US-SYS-003 | Atomic Commands, Lifecycle Gates and Honest Progress | Code baseline; acceptance open |
| US-SYS-004 | Verified File Bytes, Real Documents and Recoverable Jobs | Code baseline; acceptance open |
| US-SYS-005 | Visual Parity, Operational Quality and Evidence-Based Completion | In progress; synthetic Worker browser journey passed, full route/viewport evidence open |
| US-ENG-001 | Client Hierarchies and Multi-Contact Routing | Code baseline; acceptance open |
| US-ENG-002 | Lead Ingestion and Real Engagement Creation | In progress; synthetic public lead-to-engagement browser journey passed, full commercial acceptance open |
| US-ENG-003 | Versioned Quote and Comprehensive Proposal Generator | Code baseline; acceptance open |
| US-ENG-004 | Dual-Key Client Acceptance Gatekeeper | Code baseline; acceptance open |
| US-ENG-005 | Gated Engagement Letter with Actual Signature and Seal Rendering | Code baseline; firm asset/content acceptance open |
| US-ENG-006 | 50% Advance Invoice, Payment Allocation and Receipt Voucher | Code baseline; acceptance open |
| US-ENG-007 | Persona-Scoped Client PBC Workspace and Versioned Uploads | In progress; client document allowlist and response-history projection pass integration coverage, two-browser scope/race evidence open |
| US-ENG-008 | PBC Review, Mandatory Rejection Reasons and Live Status | In progress; required rejection reason remains client-visible while approval notes are withheld, broader acceptance open |
| US-GOV-001 | Track A — New Client KYC, AML, UBO and Independence Assessment | Code baseline; firm policy/content acceptance open |
| US-GOV-002 | Track B — Recurring Client Continuance Delta Review | Code baseline; firm policy/content acceptance open |
| US-GOV-003 | Capacity-Based Resource Assignment and Milestone Cutoffs | In progress; leave, exceptions, cutoff gates and concurrent capacity mutations are covered by Worker integration tests; full acceptance remains open |
| US-GOV-004 | Idempotent Five-Folder Engagement Taxonomy | Code baseline; acceptance open |
| US-GOV-005 | Three-Tier Materiality, Bounded Rounding and Risk Stratification | In progress; raw-basis comparisons, source accounts and itemized PBT normalization readback implemented with a server-enforced 10-character rationale minimum; independent calculation evidence open |
| US-GOV-006 | Version-Pinned Planning Sign-Off and Fieldwork Handover | Code baseline; firm-approved templates and race evidence open |
| US-FLD-001 | Validated Excel/CSV Trial Balance Ingestion and Atomic Activation | Code baseline; representative file acceptance open |
| US-FLD-002 | FSLI Mapping with Scoped Historical Memory and Coverage Checks | Code baseline; acceptance open |
| US-FLD-003 | Live Split Financial Statement Dashboard and Comparative Variances | Code baseline; visual parity evidence open |
| US-FLD-004 | Analytical Review and Period-Appropriate Going Concern Assessment | Code baseline; firm policy/content acceptance open |
| US-FLD-005 | Versioned Substantive Workprograms and Ad-Hoc Procedures | Policy activation ledger, approved-row immutability and effective-date provisioning gate implemented; approved workprogram matrix acceptance open |
| US-FLD-006 | Independent Row Concurrency, Conflict Resolution and Stale-Review Protection | Code baseline; two-browser race evidence open |
| US-FLD-007 | Reproducible Monetary Unit Sampling with Conservative Statistical Evaluation | Effective-dated approved-policy activation implemented; firm methodology and independent calculations open |
| US-FLD-008 | Systematic Random Sampling with Stable Order and Honest Sample-Size Basis | Effective-dated approved-policy activation implemented; independent calculations open |
| US-FLD-009 | Stratified Attribute Sampling with Finite-Population Evaluation | Effective-dated approved-policy activation implemented; independent calculations open |
| US-FLD-010 | Hybrid Digital and Physical Evidence with Version-Pinned References | Code baseline; opened-file/hash reconciliation open |
| US-FLD-011 | Three-Tier Review, Mandatory Rework and Independent Decisions | Code baseline; workflow acceptance open |
| US-FLD-012 | Balanced AJEs, Unadjusted Differences and Versioned Summary Review Memorandum | Code baseline; independent ledger/calculation evidence open |
| US-FLD-013 | External Confirmations and Idempotent Holding-Letter Release Blocker | Code baseline; release-blocker race evidence open |
| US-REP-001 | Partner-Only Four-Way Opinion and Conditional Basis Builder | Code baseline; approved report policy and identity limitation acknowledged |
| US-REP-002 | Signature/Seal Rendering with Explicit Consent and Artifact Provenance | Code baseline; approved firm assets and artifact reconciliation open |
| US-REP-003 | Auditor Report and Complete Financial Statement Compilation | Code baseline; rendered document acceptance open |
| US-REP-004 | Management Letter and Pre-Report Signed Letter of Representation | Code baseline; approved templates and opened-file evidence open |
| US-REP-005 | Atomic Five-Part Release, Final Fee Note and Reliable Delivery | Code baseline; provider delivery and atomic failure evidence open |
| US-REP-006 | Immediate Portal Upload Freeze Including In-Flight Uploads | Code baseline; two-browser freeze race evidence open |
| US-REP-007 | 60-Day Assembly Deadline and Sealed Read-Only Archive | Code baseline; isolated restore and large-archive evidence open |
| US-PRC-001 | Grade-Based Charge-Out Rates and Approved Time Recording | Effective-dated rate activation/retirement and Partner rationale implemented; firm-approved rates and full end-to-end evidence open |
| US-PRC-002 | Capacity-Adjusted Utilization and Transparent Availability | Code baseline; cross-record reconciliation open |
| US-PRC-003 | Engagement Profitability and Phase Budget Variances | Code baseline; independent financial reconciliation open |
| US-PRC-004 | Firm Chart of Accounts and Atomic Double-Entry Journals | Code baseline; ledger reconciliation open |
| US-PRC-005 | Firm Expenses, Petty Cash and Partner Withdrawals | Code baseline; firm policy/content acceptance open |
| US-PRC-006 | Internal Firm Trial Balance and Monthly Profit and Loss | Code baseline; ledger reconciliation open |
| US-PRC-007 | Reconciled AR Aging, Payment Allocation and Post-Archive Collection | Code baseline; end-to-end post-archive collection evidence open |

## Current verified work

- E05-S02 adds a named acceptance matrix for US-M3-004/005 to the seeded Worker integration scenario: required FSLI assertions, persisted state, evidence invalidation, submit validation, ad-hoc required fields/audit/revision/change-feed, submission lock, reviewer return/rework/resubmission, and persona gates. Focused matrix: 11/11 including the outer scenario; `npm run test:unit`: 195 passed, 1 skipped, 0 failed; `npm run cloud:typecheck` passed. The full 13/13 E2E run passed before this test-only increment. No runtime behavior change was needed; broader US-FLD-005 firm-approved matrix acceptance remains open.
- The E05-S04 client-document-centre increment supports the client projection in US-ENG-007/008: the portal returns only issued letters/invoices/receipts, accepted Holding Letters with their saved blocker snapshot, and committed parts/attachments in Partner-released bundles. Client responses omit findings, adjustments and ordinary approval notes while preserving the required PBC rejection reason. The delivery summary omits pending invoices and duplicate receipt/provider identifiers. The latest full unit run reports 184 tests: 183 passed, 1 opt-in stress test skipped, 0 failed; the focused client-document/workspace file reports 4 passed, 0 failed.
- Before this client-document increment, `npm run lint`, `npm run cloud:typecheck`, `npm run build`, and `npm run test:unit` passed with 176 unit tests passed, 1 opt-in stress test skipped, and 0 failed.
- The pre-increment `npm run test:e2e` passed all 13 browser acceptance tests against the isolated local Worker/D1/R2 fixture. Coverage includes workspace/persona persistence and offline failure, visible lead-to-engagement creation, quote revision and fail-closed email, opinion variants and atomic report lifecycle, isolated backup restore with every committed original byte, two-browser fieldwork conflict, and the listed sampling, hybrid evidence, SRM, going-concern, and time-recording journeys. The current post-increment full E2E rerun has not yet returned a final result.
- Two stale test expectations found by the browser run were corrected: an unsupported POST against the workspace resource path receives the router's documented 400 method-mismatch response, and the rendered FSLI label preserves its catalog capitalization (`Synthetic revenue`).
- Migration 0052 adds append-only `PolicyActivation` history for workprogram templates, sampling policies and charge-out rates. Approval now records rationale and effective date; replaced policies retire at the supersession date, retirement is Partner-only, and workprogram provisioning, sampling-plan creation and charge-out lookup use the effective ledger. Approved template and sampling-policy source rows are immutable. `npm run build`, `npm run cloud:typecheck`, and the focused migration plus BUSINESS workspace tests pass (2/2); the focused two-browser fieldwork journey is in progress. This covers an implementation gap only and does not close the stories' remaining acceptance gates.
- US-GOV-003 now rechecks the approved-exception daily cap and the schedule-versus-assignment total inside atomic command batches. The BUSINESS workspace integration test races two exception approvals and a schedule reduction against a new assignment, then checks that the committed staff-day does not exceed scheduled minutes less leave plus explicit exceptions. `npm run lint`, `npm run cloud:typecheck`, `npm run build`, `npm run test:unit` (179 passed, 1 skipped), and `git diff --check` pass on this working diff. Current full browser runs are still in progress; no claim is made that this closes the epic's route, responsive, external integration, or business acceptance gates.
- US-GOV-005 now presents each materiality tier’s exact raw QAR result, saved threshold, signed percentage variance against that tier’s original raw basis, and saved reviewer rationale. The GET projection reconstructs exact contributing account/FSLI IDs from the pinned TB and mapping versions. PBT normalization accepts multiple separately evidenced items, enforces a trimmed 10-character overall rationale in the Worker, returns the item details on readback, and preserves item order when creating a new threshold version. `npm run cloud:typecheck` and `npm run build` pass; the full unit run reports 184 tests (183 passed, 1 opt-in stress test skipped), the focused post-versioning BUSINESS workspace, benchmark and formatter run passes 7/7, and the latest focused BUSINESS workspace and benchmark regression run passes 4/4. Independent calculation evidence and firm policy acceptance remain open.

## Epic-wide release gates still open

1. **Deployment is complete; production readiness remains open.** GitHub Actions run `37912091736` for main commit `4ff0fe0ef375efc9c35e5960b0287ef3f6ad5469` passed verification, applied migration `0045`, and deployed the Worker/assets. The final readiness probe returned HTTP 503 with `TURNSTILE_NOT_CONFIGURED` and `PUBLIC_LEAD_IP_HASH_SECRET_NOT_CONFIGURED`; the SharePoint integration also reports that Graph rejected the client credential. Do not mark the release ready until those settings are corrected and the live readiness/integration probes pass.
2. Complete the cross-slice acceptance matrix in an isolated Worker/D1/R2 environment, including business failure gates and live service integrations; the current browser suite verifies representative journeys, not every criterion in slices 2–7.
3. Capture current UI parity evidence at 1440px and 390px for every retained route, including keyboard and loading/empty/error/conflict/read-only states.
4. Extend the file evidence matrix across all generated/uploaded artifact classes and retain explicit two-browser evidence for independent-row and release-freeze races; the current suite already verifies representative committed-byte/hash, version-conflict, report-release, and portal-freeze journeys.
5. The isolated synthetic backup/restore journey passed and reconciled the restored financial totals, manifest, and all committed original bytes. A tenant backup/restore rehearsal remains open.
6. Obtain firm-approved templates, methodology, policy, chart-of-accounts, retention and other activation inputs. Missing inputs must continue to block affected actions; they must not be filled with synthetic approvals.
7. Establish and verify a trusted access perimeter before using confidential records. The current `workers_dev: true` endpoint is public and the application has no authentication; it is not an approved confidential-data environment.

8. **E01-S05 data retirement completed.** The owner authorized deletion of the developer-environment TEST data after reviewing the exact D1 counts. The 21 active, unexpired TEST workspaces (998 `workspace_entities`, 84 `workspace_root_documents`, and 21 `workspace_sessions`) were retired through the existing lifecycle status. The 2026-10-09 Cloudflare deployment applied migration `0045`; post-deploy reads verified schema version 52, zero active TEST workspaces, and absence of all seven retired legacy tables. Migration `0045` also removed inactive/history rows from those tables (pre-migration table totals: 1,412 entities, 120 root documents, 30 sessions, and 30 expiry rows). The FK-restricted workspace rows and related business/audit records were retained.

The build and unit evidence above is local engineering evidence only. It is not a signed business UAT, security certification, or production deployment approval.
