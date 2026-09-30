# Resolution of the legacy/lifecycle review

Review source: `AuditSphere_Requirements_Legacy_Lifecycle_Review_2ba177c.md`, reviewed baseline `2ba177c35ba649036db800c29dca41371fefb94b`. This change implements its F01–F22 remediation within the existing five-module synthetic prototype. The detailed STE v2.1 user stories supply the concrete presentation terminology. Document recommendations are implementation requirements, not authority to claim professional or client sign-off.

On 2026-10-01 the user chose the newer “STE Audit Management Tool” page as the governing source and said its readable contents would be provided. Those contents are pending. The fallback v2.1 specification therefore does not establish final source fidelity or acceptance; concrete remediation against the attached review continues independently.

## Finding-by-finding changes

| Finding | Implemented remediation | Evidence |
|---|---|---|
| F01 lifecycle gates | Valid lead/profile, draft versus successfully dispatched proposal, submitted-procedure Manager queue, current review/SRM/Partner basis and exact five-part release. Rework does not advance the queue. | `reviewRemediation.test.ts`, canonical browser journey, current lifecycle tests |
| F02 commercial basis | Exact proposal/client/revision, service family including distinct Internal Audit, explicit reporting cutoff, currency and accepted fee. Presented items/fees cannot drift silently. Removed EL client-wide fallback. | Wrong year/service/cutoff/fee tests and atomic EL failure checks |
| F03 EL fidelity/history | Actual reporting period and submission deadline; Manager draft versus assigned-Partner issuance; retained previous EL content. Synthetic seal replaces invented verified registration text. | June-period/history and draft/issue tests |
| F04 unpaid advance visibility | Partner issuance creates an Issued advance invoice before any receipt. Portal discloses issued unpaid invoices in engagement scope. | Draft/Issued regression and portal browser checkpoints |
| F05 automatic handovers | Effective 50% receipt creates five folders, verified simulated workspace and liaison reset invitation; critical confirmation transitions generate idempotent Holding Letters; Manager clearance generates SRM with retry. Human risk/planning/Partner approvals remain explicit. | Receipt/onboarding idempotency, Holding Letter tests, browser workflow |
| F06 partial success | Payment saved once; receipt/onboarding failure explicitly reports pending output. Retrying reuses the recorded payment and current receipt basis. | Injected artifact-storage failure and retry regression |
| F07 benchmark provenance | Materiality reconciles to accepted/mapped current TB, records contributing accounts/source version and explicit account/rationale-backed PBT normalizations. Arbitrary numerically valid benchmarks fail. | Derived-value and arbitrary-benchmark tests; rounding/band regressions |
| F08 risk and ownership | Planning groups at FSLI using the execution classifier. Significant/critical estimates stay Red; generated Amber procedures assign Senior and Red procedures assign Manager. Role guards govern execution. | Significant low-balance and Red execution regressions |
| F09 assigned Partner | Planning approval compares immutable actor/person identity with assigned Partner; early lock uses the same assigned-Partner authority. Display-name duplicates cannot approve. | Unassigned same-name Partner test, planning authority and archive guards |
| F10 program routing | Substantive lookup excludes broad Analytical Review/Going Concern; current mapped FSLIs have separate substantive assertion programs. | Equity routing regression and program coverage tests |
| F11 concurrency | Separate generated workpapers per program; three-way local-tab merge preserves different record/procedure edits and rejects conflicting same-row changes. | Sales/PPE merge/conflict regression; row lease/revision tests |
| F12 digital evidence | Digital, Physical and Hybrid modes; digital requires current same-engagement adequate evidence, physical requires index/description, Hybrid requires both. | Digital/Hybrid negative and current-version tests |
| F13 SRM | Structured AJE revision/status/reflection schedule; adjusted versus pending/rejected distinction; unadjusted gross/net totals against SAD/PM; significant-estimate/going-concern evaluation. AJE changes invalidate review basis. Linked adjusted differences are not counted again. | One-journal/unadjusted-difference/estimate schedule fixture, review-basis regressions, canonical generated SRM, AJE workflow |
| F14 AJE workflow | Findings exposes balanced authoring, optional finding support, independent technical review, returned-journal amendment, management approval and current-TB reflection/reporting inclusion. Client finance cannot make management decisions. | Actual visible browser form sequence |
| F15 final invoice | Regeneration validates commercial amount/currency and retains one invoice obligation; each bundle revision gets its own artifact link to that invoice. Current balance download follows the current delivered bundle. | Release/billing regressions and generated bundle journey |
| F16 final presentation | Genuine generated report PDF contains synthetic vector seal, signature representation and explicit demonstration disclaimer. Unsigned LOR working copy remains outside the five final components. | Generated `review-final-report.pdf`, visual seal inspection, genuine artifact/Word tests |
| F17 archive integrity | Expiry records effective closure immediately. Manual and automatic paths share byte verification/packaging, Pending/Verified/Incomplete status, explicit missing originals and scoped retry. Reload preserves closure even without a report set. | Expiry/reload regression, frozen browser journey and artifact verification |
| F18 full inspection | Full scoped records/history plus final/source/workpaper/evidence/SRM/receipt artifacts. New TB/population originals are retained. Single ZIP includes digest-verified originals, sealed inspection and an exception-aware manifest. Foreign receipt allocations are excluded. | ZIP decompression and source-file assertions in Chrome; scoped inspection test |
| F19 reversals | Effective advance derives nonreversed scoped allocations. Portal labels reversed/partly reversed historical receipts and shows only effective settlement. | Reversal/effective allocation tests and portal checks |
| F20 financial basis | One invoice/receipt/reversal/expense projection feeds TB and P&L; aging uses allocated settlement at selected month end. Reversals post on their date. Recorded time rates remain historical; capacity is counted once per person and checked for overlaps. | Monthly reversal reconciliation and practice/time regressions |
| F21 legacy retirement | Root JS/Python runtime moved under `historical/legacy-runtime`; legacy npm commands removed. Administration/M365 renderers preserved as inert text. Current workflow guides are separate from historical 39-module guides. Active identities use five-module codes; historical redirects/types remain for migration. | Build without Administration/M365/old-guide chunks; route/scope/migration/unit checks |
| F22 presentation | Existing 17 slides enriched with exact folders, PBC statuses/reset/rejection requirements, assertions, confirmation types, bands/rates, rounding, five deliverables and simulation boundaries. React and standalone HTML share one source. Sidebar geometry and navigation specificity fixed. | All 17 notes rendered in both outputs; 96 route/width checks including 960/1000 px |

## Dependency ownership and retained history

| Supporting family | Current owning requirement / reason retained |
|---|---|
| TB parsing, mapping, financial calculations | Module 2 source-derived planning; Module 3 split statements; Module 4 report values |
| Documents, artifact store, evidence catalogue | Module 2/PBC uploads; Module 3 current evidence; Module 4 verified full archive |
| Adjustment review and support | Module 3 independent technical and client management decisions; SRM/reporting |
| Billing/receipts and firm bookkeeping | Module 1 50% advance; Module 4 balance invoice; Module 5 reconciliation |
| Roles, grants, guards and migrations | Scoped ordinary-actor demonstrations; preserve saved engagement history |
| Generic jobs, reconciliations, financial packages and group collections | Historical regression/migration support; separate retired business routes redirect to current workflows. Further deletion requires isolating shared consumers and migrating snapshots, as the review recommends. |
| Base/role styles | Existing responsive shell, controls and collapsed/drawer behavior; final overrides verified before selective removal |
| Historic module docs/test projections | Provenance and regression contracts; not current product navigation or presentation requirements |

The former root build is archived as source, not an executable supported deployment workflow. Native `public/templates/` originals remain preserved and served with base-aware download links. Template examples do not become client-released files merely because they are downloadable internally.

## Verification and limits

Executed evidence is maintained alongside this report. Unit tests verify calculations, negative gates, scope, revision staleness, migration and failure/retry behavior. Browser tests execute a command-level full lifecycle with rendered checkpoints, genuine stored files and ZIP inspection; the AR and AJE forms are exercised through visible form actions. Presentation notes are checked in both rendered outputs. Responsive coverage is 12 surfaces × 8 widths: 320, 390, 760, 960, 1000, 1024, 1440 and 1920 px.

These checks are not forty independently executed RT01–RT40 user-acceptance journeys, a fresh approved-baseline pixel-diff, or formal client/professional sign-off. Historical uploads without original bytes remain explicit exceptions; no retrofit fabricates them. Worker/D1 retains metadata snapshots for seven days and does not restore browser-local original bytes. Archive closure is application-level read-only behavior, not legal immutable retention. External mail, Microsoft provisioning, passwords, payments and seal/signature certification remain labeled simulations.
### Executed on 2026-09-30

- TypeScript/build and Worker type-check: passed.
- Unit suite: 410 passed, 0 failed/skipped (follow-up on 2026-10-01).
- Chrome suite: 13 passed, 0 failed/skipped, including cloud save/resume and verified ZIP inspection.
- Follow-up browser evidence: two actual tabs save distinct procedure edits concurrently and retain both after reload; visible payment failure/retry keeps one payment and generates a verified PDF receipt, exactly five folders and invitation; visible Manager clearance automatically generates the current verified PDF SRM.
- Follow-up bundle format gate rejects text/Office formats for required PDF outputs; the representation letter may be PDF or DOCX.
- Additional visible workflows: critical-confirmation transitions generate one verified Holding Letter and retain it after reload; Partner clearance, opinion selection, bundle compilation, signed-LOR upload and release publish exactly the current five-file set to the client portal. These start from command-created prerequisite fixtures and are not complete visible intake-to-archive journeys.
- The reporting walkthrough continues through the visible records clock form to verified closure. Its actual inspection-download button produces a ZIP that is decompressed and checked for a Verified manifest, signed LOR, original TB and original population; a superuser professional write is rejected after closure. This demonstrates the visible release-to-archive handover, not the remaining intake and planning interactions.
- Reporting-screen credentials are explicitly synthetic; unsupported verified-stamp, fabricated signing-key and strict-compliance claims were removed. Modified-opinion preview now follows the selected FSLI.
- Explicit scenario/reset recovery replaces the workspace without attempting to merge pre-migration or conflicting prior records; ordinary edits retain conflict checks. The combined browser suite exercises this following reload.
- Completion audit remains open: the five source workflows have not all been executed end-to-end solely through visible role-appropriate actions, and no fresh agreed visual baseline or formal acceptance has been supplied. These follow-up checks do not establish those remaining acceptance conditions.
- Responsive evidence: 96 route/width combinations; sidebar/shell non-overlap asserted at desktop widths including 960 and 1000 px.
- Live Worker/D1 isolation and stale-revision rejection: 1 passed, 0 failed/skipped.
- Generated report PDF rendered with Poppler and visually inspected: seal/signature, disclaimer and content fit without clipping.
- Production build emitted no Administration, M365 Setup or historical module-guide chunk. No unmeasured overall bundle-size saving is claimed.
- Git diff whitespace check: passed.
