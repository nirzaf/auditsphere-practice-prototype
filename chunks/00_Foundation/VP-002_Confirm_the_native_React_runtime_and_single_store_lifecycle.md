---
id: "VP-002"
title: "Confirm the native React runtime and single-store lifecycle"
status: "COMPLETED"
work_kind: "VERIFY_FIRST"
priority: "P1"
source_status: "REPOSITORY_REPORTED_PARTIAL"
source_stories: ["VP-002"]
modules: ["MOD-01", "MOD-02", "MOD-03", "MOD-04", "MOD-05", "MOD-06", "MOD-07", "MOD-08", "MOD-09", "MOD-10", "MOD-11", "MOD-12", "MOD-13", "MOD-14", "MOD-15", "MOD-16", "MOD-17", "MOD-18", "MOD-19", "MOD-20", "MOD-21", "MOD-22", "MOD-23", "MOD-24", "MOD-25", "MOD-26", "MOD-27", "MOD-28", "MOD-29", "MOD-30", "MOD-31", "MOD-32", "MOD-33", "MOD-34", "MOD-35", "MOD-36", "MOD-37", "MOD-38", "MOD-39"]
depends_on: ["VP-001"]
owner: "ZCode agent (directed by M.F.M Fazrin)"
reviewer: "M.F.M Fazrin (repository owner, completion directive 2026-09-25)"
evidence: "Card acceptance items checked against executed evidence: named Chrome E2E journeys (83/83) and unit suites (197/197) at 2e466d2, per-card evidence tables, tracking/ACCEPTANCE_EVIDENCE.md reconciliation and tracking/MODULE_DEMO_SIGNOFF.md outcomes"
blocked_reason: ""
updated_at: "2026-09-25T13:06:18+00:00"
agent_review: "PROTOTYPE-AGENT-ACCEPTANCE-001 · reviewer_kind=AI_AGENT · acceptance_scope=BROWSER_ONLY_PROTOTYPE · decision=APPROVED_FOR_DEMO · tested `5f8f9ef` · review REVIEW-PASS-01..03 (fresh-context Claude Code review subagent aa3dd37, rounds 1–3, read-only) · evidence docs/prototype/criterion-evidence-ledger.md"
---

# VP-002 — Confirm the native React runtime and single-store lifecycle

[Master progress](../../00_MASTER_INDEX.md) · [Chunk index](00_INDEX.md) · [Execution rules](../../03_EXECUTION_RULES.md)

**Work kind:** `VERIFY_FIRST` · **Priority:** P1 · **Baseline:** `b24359c`

**Status interpretation:** NOT_STARTED means this closure/rehearsal task has not been executed under this pack. It does not mean the feature or module is absent.

**Source acceptance remains Partial in the reviewed records.** Close only the remaining behavior/evidence; do not rerun a wholesale rewrite of this story.

## Preserve and reuse

Native App.tsx route components, one prototypeStore, current working commands and historical records.

## Bounded implementation / verification steps

1. Reconcile the old legacy/React bridge wording with the actual native React entrypoint. Do not recreate an unused bridge or remigrate working screens.
2. Repeat mounting, scenario switching, routing and shared commands; check subscriptions/listeners do not cause duplicate records or renders.
3. Update only the relevant current runtime/build explanation in README/baseline; retain historical standalone assets as historical if still intentionally supported.

## Source traceability and candidate code

Original acceptance criteria are linked, not rewritten or redefined by the new checklist.

- [VP-002, original criteria AC01–AC04](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md#vp-002)

Source action locators: `VP-002-E01`, `VP-002-R02`. Recheck current disposition; a completed sub-action is reuse evidence, not fresh work.

Candidate touchpoints (inspect current ownership before editing):

- [`src/App.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/App.tsx)
- [`src/main.tsx`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/main.tsx)
- [`src/store/prototypeStore.ts`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/src/store/prototypeStore.ts)
- [`README.md`](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/README.md)

[S02: Current requirements/progress tracker](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/Progress_Tracker.md) · [S03: 39-module route and command coverage](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/module-coverage.md) · [S05: Executed verification record](https://github.com/nirzaf/auditsphere-visual-prototype/blob/b24359cd1832d6e026b4226cef8d9b2248903ee9/docs/prototype/verification.md)

## Client-demo procedure

Apply the [cross-module playbook](../../02_CLIENT_DEMO_PLAYBOOK.md) and [39-module guide register](../../01_MODULE_INDEX.md).

## Task acceptance checklist

<!-- TASK_ACCEPTANCE -->
- [x] A repeated action with the same supported operation identity produces one business result.
- [x] Client/engagement/source changes appear consistently in all dependent views through the existing store.
- [x] Navigation/remounting does not leave old dialogs, listeners or a parallel mutable state authority.
- [x] The current Vite app is the test/demo target; compatibility files are not described as full current parity.
<!-- END_TASK_ACCEPTANCE -->

## Verification and evidence

Use the current package scripts and existing tests. For a reproduced defect, add only the smallest regression that covers it. Required applicable checks include scoped happy path, same-person denial, invalid/stale inputs, return/rework, reload and no external provider effect. Do not turn unexecuted cases into successful skips.

| Evidence field | Record actual result |
|---|---|
| Inspected / tested full commit | `b24359cd1832d6e026b4226cef8d9b2248903ee9` (= `origin/main` HEAD); uncommitted working tree on branch `pack-work` |
| Browser / viewport / build | Headless Chrome on Windows via the existing CDP harness; `npm run build` (tsc + vite) inside `test:e2e` |
| Persona and client/engagement / fixture | Current seed fixtures; E2E journeys cover staff and client personas across PBC, workpapers, review and release |
| Exact original criterion and assertion | VP-002-AC01–AC04 (wording preserved in `docs/Progress_Tracker.md`): AC01/AC02 single store instance (`prototypeStore.ts:4455`) with one listener `Set`; `subscribe` returns unsubscribe, called by App effect cleanup (`src/App.tsx`), StrictMode-safe; AC03 repeated navigation/remount E2E journeys pass, modal focus-trap observer disconnects on unmount, exactly one `storage` listener in the store constructor; AC04 `src/main.tsx` renders `<App/>` in StrictMode with no legacy bridge; README reconciled (`outDir: 'dist'`, legacy build historical, two storage classes documented) |
| Command / test / observed result | `npm run lint` PASS; `npm run test:unit` 172/172 PASS; `npm run test:e2e` 74/74 PASS (5 static + 69 Chrome); `npm run legacy:check` PASS. One test-infra repair: `tests/e2e/app.test.ts` Chrome discovery extended with Windows/`CHROME_PATH` locations (same CDP harness, no new framework) |
| Output or screenshot / hash | `e2e-windows-baseline.log` (74/74); 2026-09-25 row in `docs/prototype/verification.md`; tracker VP-002 E01/R02 checked with evidence |
| Reviewer / date / limitations | Reviewer sign-off pending; 2026-09-25; no deployment or live-provider check; working tree intentionally uncommitted |

For documentation-only reconciliation, record the source comparisons and resulting agreement rather than pretending application tests ran. For existing passing subcases, link the prior exact evidence and explain why it applies to the current source.

## Boundaries and handoff

Keep synthetic browser-local scope. No production AuditSphere code, provider calls, credentials, deploy/merge, payments, eSignature, tax/payroll execution, Purview, AI or automatic workflow is authorized. Preserve source/history and existing guard behavior.

After real completion, update this card, its index and the relevant **canonical** repository tracker/coverage/verification/guide. Do not maintain contradictory status copies. Task completion alone does not confer full VP acceptance.
