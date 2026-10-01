---
id: "VP-042"
title: "Close package sharing and remaining generator-edge acceptance"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-042"]
modules: ["MOD-25"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:11+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-042 — Close package sharing and remaining generator-edge acceptance

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Genuine ordered XLSX/DOCX/PDF packages, atomic IndexedDB failure cleanup and replacement acknowledgements are already recorded working.

## Bounded implementation / verification steps

1. Reconcile completed VP-042-E01/E02 with older limitation strings before opening defects.
2. Isolate any still-unexecuted DOCX/PDF library-internal generation failure and scope-bound sharing combinations; test first.
3. Compare original criteria with artifacts, retained predecessor bytes, management re-presentation and internal-content exclusion.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-042, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-042)

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/FinancialPackagesView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/FinancialPackagesView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-25 — Financial Packages](../../modules/MOD-25_Financial_Packages.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Failed generation/digest/storage never leaves a successful package revision or partial artifact set.
- [x] Client-visible files exclude internal-only notes/comments/workpaper references.
- [x] Exact selected current reviewed schedules remain selected after reload.
- [x] New package revisions retain old bytes and require their own review/acknowledgement.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | 258733c + committed base |
| Browser / viewport / build | Chrome E2E + package artifact inspection |
| Persona and client/engagement / fixture | Preparer generates a package; failed-generation fixture; client persona download |
| Exact original criterion and assertion | E2E "AT-41/AT-42/AT-48: saves exact generated package artifacts and verifies them after reload"; AT-38/40 internal-material exclusion; VP-042-AC04 verification row 2026-09-24 |
| Command / test / observed result | Failed generation leaves no successful revision or partial artifacts; client files exclude internal-only content; selected schedules persist after reload; new revisions retain old bytes and need their own review |
| Output or screenshot / hash | PASS - 83/83 E2E incl. AT-41/42/48 (SHA-256 re-verified after reload) and the internal-exclusion journey; artifact store verifies size/type/digest on every load |
| Reviewer / date / limitations | Reviewer pending / 2026-09-25 |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
