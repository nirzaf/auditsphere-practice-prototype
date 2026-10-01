# Requirements review resolution — 1 October 2026

Review input: `AuditSphere_Prototype_Requirements_Review_8595f24.md`, reviewed source `8595f24`. Implementation audited from `904db28`, with the additional fixes in runtime commit **1c9f274728520ed612c1080e4745c404bb80d72c**. These are prototype implementation and execution results, not an independent ISA/IFRS opinion or production certification. Historical test counts in older reports remain historical.

## Backlog resolution

| Review | Implemented behavior | Implementation / current regression evidence |
|---|---|---|
| R01 | Internal reviews remain internal; only explicitly designated, cleared correspondence enters client output once. Preview and export share a projection. Visibility changes invalidate the review basis. | `clientOutputs.ts`, `designateReviewCorrespondence`; `conformityBacklog.test.ts` internal-marker/designation cases |
| R02 | Shared standard 50/50 terms in proposals, EL, final fee note and portal. Invoice prepared with bundle, issued on release. Reissues retain one invoice obligation with separate artifact history. | `clientOutputs.ts`, `EngagementBillingView`, `generateDeliverables`; opinion/reissue unit case and visible final-fee journey |
| R03 | Missing comparative, missing FSLI, zero denominator, unchanged zero and ordinary signed movement are distinct. | `comparativeVariance.ts`, `AuditFinancialView`; `reviewCompletion.test.ts` four arithmetic cases |
| R04 | Independent mapped-FSLI programs/workpapers with aligned risk-tier owners; RED Manager execution and Partner review, visible clearance checklist. | `prepareStandardPrograms`, `clearPartner`, `ReviewSRMView`; ownership unit case, visible independent review and two-session different-FSLI cases |
| R05 | Add/remove allocations, multiple people/phases/intervals retained on reload. Three responsibility tiers do not require four people. | `SchedulingView`, `saveStaffing`; visible two-associate / Manager Planning+Review journey and capacity rejection tests |
| R06 | Week-axis planned hours, capacity and interval leave across authorized active engagements. Saved utilization targets are visible at every utilization level. | `SchedulingView`; visible staffing/calendar journey. Leave is prorated from recorded intervals; exact absence dates are not inferred. |
| R07 | MUS, Systematic Random and reviewer-defined Attribute strata retain rationale, size override, seed and source/plan revision. Too few items for strata and missing rationale fail. | `generateSample`, `TargetSamplingView`; `reviewCompletion.test.ts` all three methods/replay/strata/count/stale-source cases |
| R08 | Modified-opinion preview and report use identical Partner basis and FSLI; no invented valuation defect. | `modifiedOpinionBasisLines`; all four opinion/reissue regression and visible reporting journey |
| R09 | Explicit impact/recommendation and Manager/Partner designation required for management-letter inclusion. Incomplete designated records block compilation; other findings stay internal. | `designateManagementLetter`, shared preview/export; inclusion, role, missing-field and staleness unit tests |
| R10 | Opinion, signature/seal authorization, compilation and delivery are distinct. Signature revision pins the bundle. Earliest signature-based 60-day deadline survives compilation, release and reissue. | `authorizeReportSignature`, `currentDeliverables`, `markDeliverablesDelivered`; four-opinion/reissue test and visible signature/release/archive journey |
| R11 | Requested/Awaiting/No Response/Exception/Cancelled critical matters block release; automatic/idempotent holding-letter path and visible retry remain. | confirmation commands; critical-blocker unit cases, visible automatic holding-letter journey |
| R12 | Explicit Digital / Physical / Hybrid workbook policies match submission rules; stale linked digital files still fail with a physical index present. | `saveFieldworkWorkbook`, `submitWorkpaper`; unit readiness cases and genuine Physical/Hybrid XLSX generation through visible forms |
| R13 | Firm TB opening/movements/closing; monthly projection scope; active partial final-fee payment, reversal and full settlement with history. | `firmTrialBalance`, `PracticeView`, `EngagementBillingView`; opening/carry-forward/reversal unit cases, visible settlement/reversal journey |
| R14 | Brief proposal PDF enforces 1–2 pages; comprehensive sections retain recorded firm/team/portfolio/timeline data. Assigned-roster refresh and optional CV references replace fabricated qualifications. Distinct statutory/AUP DOCX outputs. Optional validated PNG illustrations pinned to authorization and embedded in PDFs, explicitly synthetic. | `proposalOutput.ts`, `exportService.ts`; actual PDF page/image tests, team-change test, genuine statutory/AUP DOCX tests. Native Office templates remain available internally for appropriate manual workflows. |
| R15 | Five modules / eleven canonical states, separately named substeps, parallel analytics, no mandatory EQR label. Shared React/standalone deck describes folder and signature timing correctly. | `targetLifecycle.ts`, `requirementsDeck.json`; route/state/deck regression, visible 17-slide parity check |
| R16 | Immutable view snapshot cache; frozen-only review projection cache; mutable command bases recompute. Full basis retained in records/archive; compact SRM digest in PDF. Client-output and proposal projections extracted without architectural rewrite. | cache mutation/invalidation regression, entire regression suite, [measured larger dataset](evidence/review-performance.json) |

## Acceptance mapping and evidence level

All rows below link to the runtime commit above and the commands/screens/tests named here. “Visible” means actual DOM forms/buttons in Chrome; command coverage is identified explicitly rather than represented as click-by-click coverage of every UI permutation.

| Family | Screen / command | Positive and negative executed evidence |
|---|---|---|
| A01 commercial / hierarchy | acquisition, clients, proposals, onboarding, engagement EL and billing; client/proposal/acceptance commands | Visible lead, three recipient roles, proposal dispatch, both keys, EL, advance/receipt/invitation journey. Command tests independently reject missing key/reference/scope; multi-level hierarchy retains parents and rejects missing parents/cycles. |
| A02 recurring | onboarding; `createContinuanceDraft`, `decideAcceptanceCase` | Command tests: six deliberate answers, eligible historical period, missing/adverse evaluation guards and fresh-period draft without reused work. This row is command-level evidence. |
| A03 workspace / PBC | onboarding, client portal; acceptance/provision/reset/PBC commands | Five folders before payment and external access (unit); visible portal access/reset, correction/rejection/thread/file history; wrong-client/frozen scope guards. |
| A04 scheduling | scheduling; `saveStaffing`, milestones | Visible multiple Manager phases, two associates, dates, target and leave; reload persistence. Existing command tests reject invalid rates/capacity/overlap. [Staffing evidence](evidence/review-staffing-ui.json). |
| A05 materiality | planning; plan save/review | Visible current-source plan and independent Partner decision. Command tests cover benchmark bands, TE/SAD limits, ±5% rounding, out-of-band, nonfinite and stale-source cases. |
| A06 TB/dashboard | TB wizard, financial statements | Visible CSV intake, mapping, P&L/BS/FSLI actions; real XLSX/parser/invalid-source tests. Zero/missing/signed arithmetic regression; no synthetic comparative inferred. |
| A07 FSLI/evidence | fieldwork, reviews, sampling | Visible independent preparation/review and genuine mode-specific workbook outputs; stale/wrong-engagement guards and owner independence tests. [Evidence-mode proof](evidence/review-evidence-modes-ui.json). |
| A08 sampling | sampling; population import / `generateSample` | All three required algorithms replay with recorded parameters, changed count and attribute strata; insufficient strata/missing rationale/stale source reject. Visible source/sample/evidence journey. |
| A09 review/SRM | reviews; workpaper/note/Manager/SRM commands | Visible mandatory-comment return, corrected revision, independent clearance and automatic PDF SRM; self-approval, stale review and unresolved-note guards. |
| A10 confirmations | confirmations; create/transition/holding-letter commands | Five supported categories; critical status blockers and scope/evidence guards; visible current PDF holding letter and idempotent retry. |
| A11 reporting | delivery, portal, billing | Visible signature, genuine five artifacts, exact signed LOR, one final invoice and upload freeze. All four opinions/shared basis and internal-marker/management-letter designation regression. |
| A12 archive | records; expiry/early-freeze/archive export | Visible manual lock, verified inspection ZIP, source/population/signed-LOR bytes, reload and rejected frozen mutations. Command journey day-59/day-60 cases and permanent app-level closure. Missing originals are explicit exceptions. |
| A13 practice | billing/reports | Visible partial payment, reversal and full final-fee settlement; standard rates/phase variance, firm-ledger opening/movement/closing and later-period reversal unit reconciliation. [Settlement evidence](evidence/review-final-fee-ui.json). |
| A14 concurrency | independent Chrome profiles + Worker/D1 | Distinct FSLIs retained; concurrent same-row edit conflicts explicitly. Conditional save plus bounded three-way merge; reload waits for running save. Metadata survives both profiles, original bytes are verified only in their owning profile. [Concurrency evidence](evidence/review-concurrency.json). |
| A15 docs/performance | requirements deck, README and this mapping | Shared 17-slide parity and responsive/keyboard journeys; current execution results below; larger synthetic measurement with unchanged command freshness checks. |

## Current execution

Executed on 1 October 2026 against the unchanged runtime tree committed above:

- `npm run test:unit`: **444 passed**, zero failures/skips.
- `npm run test:e2e`: production build/typecheck and **19 Chrome browser tests passed**, zero failures/skips. Includes a live Worker/D1 workspace in two independent browser profiles and responsive screenshot capture.
- `npm run demo:typecheck`: passed.
- `git diff --check`: passed.
- `npx tsx tools/benchmark-review-projections.ts`: completed; larger synthetic results recorded in the linked JSON.

Logs and temporary execution profiles are ignored; curated JSON, screenshots and generated artifact evidence are tracked. The following documentation-only commit records this report; the deployed runtime is the tested runtime above.

The browser harness includes click-by-click changed workflows as well as explicitly identified command journeys. It does not constitute a human professional sign-off or an exhaustive click test of every legacy configuration. No newly introduced file-count/license gate exists; physical storage/quota limits remain real.

## Performance measurement

The benchmark compares defensive cloning/full serialization with cached immutable reads on the same larger synthetic dataset. It includes the cold clone+freeze cost separately. Full and compact SRM references are compared using actual PDF bytes/page counts. Exact dataset, timings, sizes and method are in [review-performance.json](evidence/review-performance.json); rerun with `npx tsx tools/benchmark-review-projections.ts`. This is a component benchmark, not end-user network latency or production capacity assurance.

## Preserved simulation boundaries

User switching, mail/WhatsApp, M365 provisioning, password reset, payments, signatures/seals and dispatch remain simulations. Optional Worker/D1 workspaces retain metadata for seven days; they do not replicate original artifact bytes. IndexedDB bytes are verified locally, and inspection exports report unavailable originals honestly. A browser owner can alter/delete local data; the application archive is not legally immutable production retention. Optional PNG illustrations are validated demo artwork, not approved legal credentials. Proposal/EL outputs preserve synthetic labels and require authorized professional completion outside this prototype.
