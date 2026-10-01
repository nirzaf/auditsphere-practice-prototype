---
id: "VP-021"
title: "Close document revision, availability and storage-class guidance"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-021"]
modules: ["MOD-10", "MOD-18"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:58+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-021 — Close document revision, availability and storage-class guidance

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Current rename/move/unavailable/restore, evidence replacement and optional OneDrive flows.

## Bounded implementation / verification steps

1. Complete wrong-root, inaccessible/reference restore and linked-version cases for each relevant record type.
2. Create a factual storage matrix: metadata-only library, session-only source, durable PBC and generated/archive blobs.
3. Use that matrix in UI/help so available downloads and reload behavior are never falsely generalized.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-021, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-021)

Source action locators: `VP-021-E01`, `VP-021-E02`, `VP-021-R03`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/DocumentsLibraryView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/DocumentsLibraryView.tsx)
- [`src/components/modules/M365SetupView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/M365SetupView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-10 — Document Management](../../modules/MOD-10_Document_Management.md)
- [MOD-18 — Microsoft 365 Integration](../../modules/MOD-18_Microsoft_365_Integration.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Metadata-only records never offer a fake original download after reload.
- [x] Durable PBC/generated artifacts are not incorrectly described as metadata-only.
- [x] Old pins remain historical while new evidence requires review.
- [x] No actual SharePoint move, callback or remote transfer is required for completion.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Historical focused evidence: app source `2e466d2`, docs/test assertion `e57294e`; follow-up full suite: app source `e6a6edb`, documentation baseline `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f` |
| Browser / viewport / build | Full Chrome E2E (83/83) plus focused final AT-20 and AT-21 Chrome reruns; artifact/PBC storage-class inspection |
| Persona and client/engagement / fixture | Client_finance uploads; preparer pins evidence; packages generate artifacts |
| Exact original criterion and assertion | AT-23/24 verifies accepted PBC response bytes and SHA-256 persist in browser-local IndexedDB across reload; AT-20/21/22 verifies registered library/evidence metadata and digest persist while original bytes remain in-session and must be reselected; AT-41/42/48 verifies generated artifact bytes in IndexedDB by SHA-256. |
| Command / test / observed result | Historical focused VP-021/AT-20/21 evidence at `e57294e`; the earlier full-suite attempt that stopped during shell readiness is historical and superseded. Follow-up `npm run lint`, `npm run test:unit` (231/231), `npm run test:e2e` (105/105; 5 static + 100 Chrome, including production build), and `npm run legacy:check` passed at documentation baseline `ffcf34c0000c9cc18bc9dc2c8d1fff87b6ca060f`; see verification record row 81. |
| Output or screenshot / hash | Prior full 83/83 E2E includes AT-41/42/48 (generated bytes re-verified after reload) and AT-23/24 (PBC bytes retained/rehashed); AT-20/21 verify metadata-only library/replacement and OneDrive fixture disclosures; README documents storage classes; current focused VP-021 covers library/evidence/workpaper/PBC unavailable projections. User-selected uploads must be reselected after reload by design. |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
