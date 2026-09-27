# Execution rules and progress authority

[Master index](00_MASTER_INDEX.md) · [Pack README](PACK_README.md)

## Scope

This is an execution overlay for `nirzaf/auditsphere-visual-prototype`, pinned to `b24359cd1832d6e026b4226cef8d9b2248903ee9`. It is not a second product specification. Keep original VP-001–VP-064, MOD-01–MOD-39 and AT-01–AT-54 identities and original criterion wording. The four DEMO cards decompose the requested presentation experience; they do not create new product modules.

Before working, inspect the current HEAD, instructions, working tree and overlapping changes. Compare current source with this snapshot. Preserve completed work; do not reintroduce old legacy architecture merely because an older requirement described it. Do not commit, push, merge, deploy or operate a provider based on this pack alone.

## What each work kind means

| Kind | Required action |
|---|---|
| VERIFY_FIRST | Run/inspect the missing acceptance path first. Change code only if a real gap is reproduced. |
| IMPLEMENT_OR_VERIFY | A specific implementation gap or contract ambiguity exists; confirm the current branch, then make the smallest necessary UI/store/test change. |
| RECONCILE | Align scope, source mappings or current claims using real evidence; no speculative feature creation. |
| PROPOSED_UX | A recommended client-demo guide/tour addition under VP-003/064. Reuse existing shell/components. |
| DEMO_ACCEPTANCE | Rehearse and record the selected client agenda, including known limits and role handoffs. |

## Task status authority

Each card's front matter is the **only execution-status authority inside this bundle**. The master/chunk indexes are generated. The manifest stores inventory and source references, not a second status copy.

Allowed states: `NOT_STARTED`, `IN_PROGRESS`, `BLOCKED`, `IN_REVIEW`, `COMPLETED`, `REOPENED`. The initial 52 NOT_STARTED tasks are new closure/rehearsal assignments, not a claim that 52 application features are missing.

Use IN_PROGRESS for active work, BLOCKED only with a real reason, IN_REVIEW when the required evidence exists, and COMPLETED after the four task acceptance items are checked and an identified reviewer accepts the scope. REOPENED preserves evidence while explaining the new defect/change. Existing evidence must not be overwritten to pretend an earlier failure never occurred.

The helper checks metadata and presence of evidence references; it cannot prove the linked test ran or the reviewer is authorized. No automation can convert this package's status into professional or production acceptance.

## Product acceptance is separate

`docs/Progress_Tracker.md` in the repository remains the source of VP acceptance. `docs/prototype/module-coverage.md` and `verification.md` support that record. A generated task completion is a handoff to update those canonical files with actual evidence, not an independent claim of complete module acceptance.

`tracking/MODULE_DEMO_SIGNOFF.md` is only a rehearsal-outcome sheet. DEMONSTRATED means a named, bounded client-demo path worked. It does not mean every original criterion is accepted. A partial module may have a good demonstrated path with explicitly deferred edges.

## Dependencies and safe sequencing

Front-matter dependencies are the small coordination dependencies for this pack; they do not replace the original source dependency graph. Domain cards often have no new hard dependency because their baseline infrastructure already exists. Consume the existing validated contract, not an invented requirement to rebuild it. Do not infer ordering from the numeric VP ID alone.

Serialize shared edits to `prototypeStore.ts`, types, migrations, scenario factories, Shell, source status rows and artifact services. Feature-specific guides and isolated test additions may proceed independently after checking overlap. Do not add state libraries or an abstraction framework for these repairs.

## Recommended execution order

Start with VP-001/002/003/004 and the code-confirmed VP-048 planning issue. Prepare DEMO-001 guidance in parallel with module closure. Then close the supported accounting/group and role-sensitive handoffs selected for the actual client agenda. Complete DEMO-002/003/004 before advertising that agenda as demonstrated. Full VP-063/064 acceptance can remain separately open while a limited, honest demo is usable.

## Actual repository commands

Confirm scripts in current `package.json`, then use the relevant ones:

```bash
npm ci
npm run lint
npm run test:unit
npm run test:e2e
npm run build
npm run legacy:check
```

The recorded package has `lint = tsc --noEmit`, unit tests through `tsx --test tests/unit/*.test.ts`, and E2E builds then runs `tsx --test tests/e2e/*.test.ts`. Do not assume a Playwright config or add a new browser framework without inspecting the existing Chrome harness. Run only relevant checks during a small change, followed by the applicable full rehearsal before acceptance. Legacy syntax checks are not acceptance of the current React app.

## Evidence minimum

Record exact source/build, persona and permitted scope, scenario/as-of date, original criterion, command/assertion, expected and actual values, result, output identity where relevant, and reviewer. Distinguish NOT_RUN, FAILED and environment BLOCKED. A route rendering, a successful toast, an AT label or a CSV download event alone does not prove the required behavior.

## Amendment PROTOTYPE-AGENT-ACCEPTANCE-001 (2026-09-27)

The owner authorized Claude Code to act as the acceptance reviewer for this prototype
(see [`docs/prototype/scope.md`](docs/prototype/scope.md#amendment-prototype-agent-acceptance-001-recorded-2026-09-27)).
Where the rules above require an "identified reviewer" or "human" acceptance for demo
delivery, an AI-agent review pass with recorded provenance (`reviewer_kind=AI_AGENT`,
pass identifiers, tested SHA) satisfies it; the owner/reviewer strings on a card must
still differ and name the actual implementation and review passes. Criterion evidence is
generated by `python3 tools/criterion_ledger.py` from executed TAP results, replacing
link-count inference. Commit/push remain governed by the session's repository
authorization; this amendment grants no deployment or merge authority.
