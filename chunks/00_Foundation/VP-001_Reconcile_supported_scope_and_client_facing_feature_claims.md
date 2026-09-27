---
id: "VP-001"
title: "Reconcile supported scope and client-facing feature claims"
status: "COMPLETED"
work_kind: "RECONCILE"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-001"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: []
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:05:51+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `b988be1` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-001 — Reconcile supported scope and client-facing feature claims

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `RECONCILE` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Existing exclusions, deterministic calculations, human workflows and historical imported account labels.

## Bounded implementation / verification steps

1. Audit active navigation, settings, templates, Requirements rows and help text against the current exclusions; distinguish an imported tax/salary account label from an offered tax/payroll feature.
2. Remove misleading supported-feature claims, not historical evidence or legitimate account data. Mark historical requirement/source views clearly.
3. Check that the normal PBC, review, package, release and archive demonstrations remain reachable without live setup.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-001, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-001)

Source action locators: `VP-001-E01`, `VP-001-R02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`docs/prototype/scope.md`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/scope.md)
- [`src/components/modules/RequirementsView.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/components/modules/RequirementsView.tsx)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] Every active offered feature belongs to the allowed 39-module scope.
- [x] No live-provider, signature, payment, tax/payroll execution, AI or recurring-automation control is introduced.
- [x] Historical/source-only references are labeled and cannot trigger excluded business actions.
- [x] No scope cleanup deletes data or bypasses a review/authorization guard.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | `b24359cd1832d6e026b4226cef8d9b2248903ee9` (= `origin/main` HEAD); uncommitted working tree on branch `pack-work` |
| Browser / viewport / build | Headless Chrome on Windows via the existing CDP harness; production build inside `npm run test:e2e`; `tsc --noEmit` clean |
| Persona and client/engagement / fixture | Current seed fixtures; E2E suite exercises the staff/client personas; scope reconciliation itself is documentation-only |
| Exact original criterion and assertion | VP-001-AC01–AC04 (wording preserved in `docs/Progress_Tracker.md`): AC01 route-by-route Shell audit + `tests/unit/scope.test.ts` AT-04 scan; AC02 native entry `src/main.tsx` + historical labels in README/scope.md; AC03 PBC/workpaper/review/release journeys reachable without live setup; AC04 allowlist scan covers exclusion disclosures only |
| Command / test / observed result | `npm run lint` PASS; `npm run test:unit` 172/172 PASS; `npm run test:e2e` 74/74 PASS (5 static + 69 Chrome); `npm run legacy:check` PASS; exclusion-term grep of `src` returns disclosure/negation text only; tax/salary keyword matches are account labels/procedure text (`Tax Card Number` field, `Income tax` line, `Profit Before Tax` benchmark), retained |
| Output or screenshot / hash | `e2e-windows-baseline.log` (74/74); 2026-09-25 row in `docs/prototype/verification.md`; tracker VP-001 E01/R02 checked with evidence |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment or live-provider check; working tree intentionally uncommitted (pack rule: no commit based on the pack alone) |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
