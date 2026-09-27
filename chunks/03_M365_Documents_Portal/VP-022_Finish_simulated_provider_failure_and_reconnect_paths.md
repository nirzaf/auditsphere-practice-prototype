---
id: "VP-022"
title: "Finish simulated provider failure and reconnect paths"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P2"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-022"]
modules: ["MOD-18"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:07:17+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-022 — Finish simulated provider failure and reconnect paths

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P2 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing denied/missing/expired/throttled/unavailable provider fixtures.

## Bounded implementation / verification steps

1. Exercise each named failure with changed tenant/site/root/sender and cancel/reconnect paths.
2. Bind prior verification to its exact fixture revision and show stale/unavailable states after disconnect.
3. Demonstrate manual recovery while retaining records and no background retries.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-022, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-022)

Source action locators: `VP-022-E01`, `VP-022-E02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/components/modules/M365SetupView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/M365SetupView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Use the following role/context/input/result guides. They include expected success and a negative/rework example; record actual rehearsal rather than assuming it passed.

- [MOD-18 — Microsoft 365 Integration](../../modules/MOD-18_Microsoft_365_Integration.md)

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Provider-dependent controls reflect disconnected/stale status.
- [x] Existing local business work remains usable where unrelated.
- [x] Old verification cannot silently validate new settings.
- [x] No real provider request or automatic retry occurs.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | Worktree based on `78b2920`; updated acceptance test and verification record in the current worktree |
| Browser / viewport / build | Production Vite build and headless Chrome; focused AT-15/AT-16 1/1 and full E2E 83/83 |
| Persona and client/engagement / fixture | Manager; synthetic SharePoint site/root, synthetic sender, Example Trading Entity / ENG-26001; initial state reset inside AT-15 |
| Exact original criterion and assertion | AT-15/AT-16; VP-022-AC01–AC04 subcases: changed settings stale prior verification; disconnect preserves records and logs history; retries are explicit; every failure stays simulated and no Purview/live provider surface appears |
| Command / test / observed result | `npm run lint`; `npm run build`; `npm run test:unit` 197/197; focused AT-15/AT-16 1/1; `npm run test:e2e` 83/83; `git diff --check` PASS |
| Output or screenshot / hash | Changed tenant/site/root/sender each invalidate prior checks; denied/missing/expired/throttled/unavailable outcomes offer manual recovery; successful disconnect increments configuration revision and disables workspace prep without deleting client, document or folder metadata; explicit SharePoint re-verification restores it while liveConnected remains false; intercepted browser requests show no external egress. |
| Reviewer / date / limitations | M.F.M Fazrin (repository owner, completion directive 2026-09-25); source VP-022 remains Partial pending story-level criterion sign-off and broader stakeholder acceptance. |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
